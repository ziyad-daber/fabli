export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { calculateOrderCommission } from '@/lib/utils/commission'
import { generateOrderNumber, generateIdempotencyKey } from '@/lib/utils/helpers'
import { OrderStatus } from '@prisma/client'
import { z } from 'zod'

const createOrderSchema = z.object({
  supplierId: z.string().uuid(),
  pickupAddressId: z.string().uuid().optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().optional(),
    quantity: z.number().int().min(1),
    resellerPrice: z.number().positive(),
  })).min(1),
  shippingFee: z.number().min(0).default(0),
  customerName: z.string().min(2),
  customerPhone: z.string().min(10),
  customerEmail: z.string().email().optional().nullable(),
  customerAddress: z.string().min(5),
  customerCity: z.string().min(2),
  customerPostalCode: z.string().optional(),
  customerNotes: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const session = await auth()
    
    if (!session?.user || session.user.role !== 'RESELLER') {
      return NextResponse.json(
        { error: 'Non autorisé - Réservé aux revendeurs' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validation = createOrderSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const data = validation.data

    // Get platform commission rate from settings
    const commissionSetting = await prisma.platformSetting.findUnique({
      where: { key: 'commission_rate' }
    })
    const commissionRate = commissionSetting ? parseFloat(commissionSetting.value) : 0.10

    // Fetch product details and verify supplier ownership
    const productIds = data.items.map(item => item.productId)
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        supplierId: data.supplierId,
        status: 'ACTIVE',
      },
      include: { variants: true }
    })

    if (products.length !== productIds.length) {
      return NextResponse.json(
        { error: 'Un ou plusieurs produits sont introuvables ou n\'appartiennent pas à ce fournisseur' },
        { status: 400 }
      )
    }

    // Get pickup address
    let pickupAddress = null
    if (data.pickupAddressId) {
      pickupAddress = await prisma.pickupAddress.findUnique({
        where: { id: data.pickupAddressId, supplierId: data.supplierId }
      })
      if (!pickupAddress) {
        return NextResponse.json(
          { error: 'Adresse de ramassage invalide' },
          { status: 400 }
        )
      }
    } else {
      // Use default pickup address
      pickupAddress = await prisma.pickupAddress.findFirst({
        where: { supplierId: data.supplierId, isDefault: true }
      })
    }

    // Build order items with snapshot pricing
    const orderItems = data.items.map(item => {
      const product = products.find(p => p.id === item.productId)!
      const variant = item.variantId 
        ? product.variants.find(v => v.id === item.variantId)
        : null
      
      const supplierPrice = variant 
        ? Number(product.supplierPrice) + Number(variant.additionalPrice)
        : Number(product.supplierPrice)
      
      return {
        productId: product.id,
        variantId: item.variantId,
        quantity: item.quantity,
        unitSupplierPrice: supplierPrice,
        unitResellerPrice: item.resellerPrice,
        unitCommission: Number((supplierPrice * commissionRate).toFixed(2)),
        totalSupplierPrice: Number((supplierPrice * item.quantity).toFixed(2)),
        totalResellerPrice: Number((item.resellerPrice * item.quantity).toFixed(2)),
        totalCommission: Number((supplierPrice * commissionRate * item.quantity).toFixed(2)),
      }
    })

    const commissionCalc = calculateOrderCommission(
      data.items.map(item => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        supplierPrice: orderItems.find(oi => oi.productId === item.productId && oi.variantId === item.variantId)?.unitSupplierPrice || 0,
        resellerPrice: item.resellerPrice,
      })),
      commissionRate
    )

    const subtotal = commissionCalc.subtotal
    const commissionAmount = commissionCalc.totalCommission
    const codAmount = subtotal + data.shippingFee // COD = client total

    // Create order in transaction
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          resellerId: session.user.resellerProfile!.id,
          supplierId: data.supplierId,
          pickupAddressId: pickupAddress?.id,
          status: OrderStatus.PENDING,
          subtotal,
          shippingFee: data.shippingFee,
          codAmount,
          commissionRate,
          commissionAmount,
          currency: 'MAD',
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          customerEmail: data.customerEmail,
          customerAddress: data.customerAddress,
          customerCity: data.customerCity,
          customerPostalCode: data.customerPostalCode,
          customerNotes: data.customerNotes,
          items: {
            create: orderItems
          },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: OrderStatus.PENDING,
              actorId: session.user.id,
              actorRole: 'RESELLER',
              notes: 'Commande créée par le revendeur'
            }
          }
        },
        include: {
          items: {
            include: {
              product: true,
              variant: true
            }
          },
          supplier: true,
          reseller: true
        }
      })

      // Create commission record
      await tx.commission.create({
        data: {
          orderId: newOrder.id,
          rate: commissionRate,
          amount: commissionAmount,
          currency: 'MAD',
          status: 'PENDING',
          dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        }
      })

      // Create COD collection record
      await tx.codCollection.create({
        data: {
          orderId: newOrder.id,
          expectedAmount: codAmount,
          currency: 'MAD',
          status: 'EXPECTED',
        }
      })

      return newOrder
    })

    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    console.error('Create order error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création de la commande' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth()
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}

    // Role-based filtering
    if (session.user.role === 'RESELLER') {
      where.resellerId = session.user.resellerProfile?.id
    } else if (session.user.role === 'SUPPLIER') {
      where.supplierId = session.user.supplierProfile?.id
    } else if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    if (status) {
      where.status = status
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          items: {
            include: {
              product: true,
              variant: true
            }
          },
          supplier: {
            select: { companyName: true }
          },
          reseller: {
            select: { companyName: true }
          },
          shipments: true,
          commission: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where })
    ])

    return NextResponse.json({
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Get orders error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des commandes' },
      { status: 500 }
    )
  }
}