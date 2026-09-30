export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { OrderStatus, Prisma } from '@prisma/client'
import { z } from 'zod'
import { generateIdempotencyKey } from '@/lib/utils/helpers'

const updateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  notes: z.string().optional(),
  // For shipment creation
  trackingCode: z.string().optional(),
  externalId: z.string().optional(),
  labelUrl: z.string().optional(),
})

const validTransitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.ACCEPTED, OrderStatus.REJECTED, OrderStatus.CANCELLED],
  ACCEPTED: [OrderStatus.IN_PRODUCTION, OrderStatus.REJECTED, OrderStatus.CANCELLED],
  IN_PRODUCTION: [OrderStatus.READY_TO_SHIP, OrderStatus.CANCELLED],
  READY_TO_SHIP: [OrderStatus.SHIPMENT_CREATED, OrderStatus.CANCELLED],
  SHIPMENT_CREATED: [OrderStatus.IN_TRANSIT, OrderStatus.CANCELLED, OrderStatus.SHIPMENT_ERROR],
  IN_TRANSIT: [OrderStatus.DELIVERED, OrderStatus.DELIVERY_FAILED, OrderStatus.RETURNED],
  DELIVERED: [OrderStatus.RETURNED],
  REJECTED: [],
  CANCELLED: [],
  DELIVERY_FAILED: [OrderStatus.RETURNED, OrderStatus.IN_TRANSIT],
  RETURNED: [],
  SHIPMENT_ERROR: [OrderStatus.READY_TO_SHIP, OrderStatus.CANCELLED],
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id } = await params
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        supplier: true,
        reseller: true,
        shipments: true,
        pickupAddress: true,
      }
    })

    if (!order) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }

    // Authorization checks
    const userRole = session.user.role
    const userId = session.user.id

    if (userRole === 'SUPPLIER' && order.supplierId !== session.user.supplierProfile?.id) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    if (userRole === 'RESELLER' && order.resellerId !== session.user.resellerProfile?.id) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    if (userRole !== 'ADMIN' && userRole !== 'SUPPLIER' && userRole !== 'RESELLER') {
      return NextResponse.json({ error: 'Rôle non autorisé' }, { status: 403 })
    }

    const body = await request.json()
    const validation = updateOrderStatusSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { status: newStatus, notes, trackingCode, externalId, labelUrl } = validation.data

    // Validate transition
    const allowedTransitions = validTransitions[order.status] || []
    if (!allowedTransitions.includes(newStatus)) {
      return NextResponse.json(
        { error: `Transition invalide de ${order.status} vers ${newStatus}` },
        { status: 400 }
      )
    }

    // Additional role-based restrictions
    if (userRole === 'RESELLER' && newStatus !== OrderStatus.CANCELLED) {
      return NextResponse.json(
        { error: 'Les revendeurs ne peuvent qu\'annuler les commandes' },
        { status: 403 }
      )
    }

    // Supplier can only move forward in production flow
    if (userRole === 'SUPPLIER') {
      const supplierAllowed: OrderStatus[] = [
        OrderStatus.ACCEPTED,
        OrderStatus.IN_PRODUCTION,
        OrderStatus.READY_TO_SHIP,
        OrderStatus.REJECTED,
        OrderStatus.CANCELLED,
      ]
      if (!supplierAllowed.includes(newStatus)) {
        return NextResponse.json(
          { error: 'Action non autorisée pour ce statut' },
          { status: 403 }
        )
      }
    }

    // Update order in transaction
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = { status: newStatus }
      
      // Set timestamps based on status
      const now = new Date()
      switch (newStatus) {
        case OrderStatus.ACCEPTED:
          updateData.acceptedAt = now
          break
        case OrderStatus.IN_PRODUCTION:
          // acceptedAt should already be set
          break
        case OrderStatus.READY_TO_SHIP:
          updateData.producedAt = now
          updateData.readyToShipAt = now
          break
        case OrderStatus.SHIPMENT_CREATED:
          updateData.shippedAt = now
          break
        case OrderStatus.DELIVERED:
          updateData.deliveredAt = now
          break
      }

      const updated = await tx.order.update({
        where: { id },
        data: updateData,
        include: {
          items: true,
          supplier: true,
          reseller: true,
          shipments: true,
          commission: true,
        }
      })

      // Create status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: newStatus,
          actorId: userId,
          actorRole: userRole,
          notes,
        }
      })

      // Handle shipment creation
      if (newStatus === OrderStatus.SHIPMENT_CREATED && trackingCode) {
        const idempotencyKey = generateIdempotencyKey(`ship_${id}`)

        const pickupAddress = order.pickupAddress
          ? {
              name: order.pickupAddress.name,
              contactName: order.pickupAddress.contactName,
              phone: order.pickupAddress.phone,
              address: order.pickupAddress.address,
              city: order.pickupAddress.city,
              postalCode: order.pickupAddress.postalCode,
            }
          : Prisma.JsonNull

        await tx.shipment.create({
          data: {
            orderId: id,
            trackingCode,
            externalId,
            labelUrl,
            status: 'CREATED',
            carrier: 'AMEEX',
            pieces: 1,
            idempotencyKey,
            pickupAddress,
            deliveryAddress: {
              name: order.customerName,
              phone: order.customerPhone,
              address: order.customerAddress,
              city: order.customerCity,
              postalCode: order.customerPostalCode,
            },
            codAmount: order.codAmount,
          }
        })

        // Update COD collection with tracking code
        await tx.codCollection.update({
          where: { orderId: id },
          data: {
            shipmentId: (await tx.shipment.findFirst({ where: { orderId: id } }))?.id,
          }
        })
      }

      // Handle delivery - update COD collection
      if (newStatus === OrderStatus.DELIVERED) {
        await tx.codCollection.update({
          where: { orderId: id },
          data: {
            status: 'COLLECTED',
            collectedAt: now,
          }
        })
      }

      return updated
    })

    return NextResponse.json(updatedOrder)
  } catch (error) {
    console.error('Update order status error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour du statut' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id } = await params
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
            variant: true
          }
        },
        supplier: {
          include: { user: { select: { email: true } } }
        },
        reseller: {
          include: { user: { select: { email: true } } }
        },
        pickupAddress: true,
        shipments: {
          include: { apiLogs: true }
        },
        commission: true,
        codCollection: true,
        statusHistory: {
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    if (!order) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }

    // Authorization
    const userRole = session.user.role
    if (userRole === 'SUPPLIER' && order.supplierId !== session.user.supplierProfile?.id) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    if (userRole === 'RESELLER' && order.resellerId !== session.user.resellerProfile?.id) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    if (userRole !== 'ADMIN' && userRole !== 'SUPPLIER' && userRole !== 'RESELLER') {
      return NextResponse.json({ error: 'Rôle non autorisé' }, { status: 403 })
    }

    return NextResponse.json(order)
  } catch (error) {
    console.error('Get order error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la commande' },
      { status: 500 }
    )
  }
}