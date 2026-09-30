export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { OrderStatus } from '@prisma/client'
import { z } from 'zod'
import { applyOrderTransition, OrderTransitionError } from '@/lib/orders/transition'
import { SUPPLIER_ALLOWED } from '@/lib/orders/status'

const updateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  notes: z.string().max(1000).optional(),
  /** Raison de refus ou d'annulation, conservée sur la commande. */
  reason: z.string().max(500).optional(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * PATCH /api/orders/[id] — changement de statut.
 *
 * Le Code Suivi n'est **pas** accepté ici : il provient de l'API AMEEX via
 * POST /api/shipments, ou d'une saisie manuelle d'administrateur. L'accepter
 * ici permettrait d'attacher un Code Suivi arbitraire à une commande (§6.4).
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { id } = await params
    const order = await prisma.order.findUnique({
      where: { id },
      include: { supplier: true, reseller: true, shipments: true, pickupAddress: true },
    })

    if (!order) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }

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

    const body = await request.json()
    const validation = updateOrderStatusSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { status: newStatus, notes, reason } = validation.data

    // Le revendeur ne fait qu'annuler (§5.3 : annulation de sa commande).
    if (userRole === 'RESELLER' && newStatus !== OrderStatus.CANCELLED) {
      return NextResponse.json(
        { error: "Les revendeurs ne peuvent qu'annuler une commande" },
        { status: 403 }
      )
    }

    // Le fournisseur prend en charge et prépare ; il ne gère ni l'expédition
    // ni la livraison, qui relèvent de l'intégration et du webhook.
    if (userRole === 'SUPPLIER' && !SUPPLIER_ALLOWED.includes(newStatus)) {
      return NextResponse.json(
        { error: 'Action non autorisée pour ce statut' },
        { status: 403 }
      )
    }

    // L'expédition se crée par POST /api/shipments : le statut ne peut pas être
    // posé à la main, sinon la commande afficherait « Expédition créée » sans
    // Code Suivi.
    if (newStatus === OrderStatus.SHIPMENT_CREATED) {
      return NextResponse.json(
        {
          error:
            "Le statut « Expédition créée » est positionné automatiquement après création du colis via POST /api/shipments.",
        },
        { status: 400 }
      )
    }

    const extraData: Record<string, unknown> = {}
    if (newStatus === OrderStatus.REJECTED && reason) extraData.rejectedReason = reason
    if (newStatus === OrderStatus.CANCELLED && reason) extraData.cancelledReason = reason

    const updated = await prisma.$transaction(async (tx) => {
      if (Object.keys(extraData).length > 0) {
        await tx.order.update({ where: { id }, data: extraData })
      }

      return applyOrderTransition({
        orderId: id,
        to: newStatus,
        actorId: session.user.id,
        actorRole: userRole,
        notes: notes ?? reason,
        tx,
      })
    })

    const fresh = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        supplier: { select: { id: true, companyName: true } },
        reseller: { select: { id: true, companyName: true } },
        shipments: true,
        commission: true,
      },
    })

    return NextResponse.json({ order: fresh, transition: updated })
  } catch (error) {
    if (error instanceof OrderTransitionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('[Update order status] Error:', error)
    return NextResponse.json({ error: 'Erreur lors de la mise à jour du statut' }, { status: 500 })
  }
}

/**
 * GET /api/orders/[id] — détail complet d'une commande.
 * Les données client ne sont visibles que par l'administrateur, le fournisseur
 * concerné et le revendeur concerné (§9 « accès limité aux données
 * personnelles nécessaires à la livraison »).
 */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { id } = await params
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: true, variant: true } },
        supplier: { include: { user: { select: { email: true } } } },
        reseller: { include: { user: { select: { email: true } } } },
        pickupAddress: { include: { ameexCity: true } },
        deliveryCity: true,
        shipments: true,
        commission: true,
        codCollection: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }

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
    console.error('[Get order] Error:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération de la commande' }, { status: 500 })
  }
}