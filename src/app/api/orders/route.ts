export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { OrderStatus, Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  calculateOrderCommission,
  getCommissionRate,
  round2,
} from '@/lib/utils/commission'
import { resolveCity } from '@/lib/ameex/cities'
import { audit, getRequestMeta } from '@/lib/utils/audit'
import { notifyOrderCreated } from '@/lib/notifications/service'

const createOrderSchema = z.object({
  // Une commande porte un seul fournisseur : le cahier des charges décrit une
  // commande par ligne de commande, chaque ligne ayant son prix fournisseur.
  supplierId: z.string().min(1, 'Fournisseur manquant'),
  pickupAddressId: z.string().min(1).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().min(1).optional(),
        quantity: z.number().int().min(1).max(999),
        resellerPrice: z.number().positive('Le prix de vente doit être supérieur à 0'),
      })
    )
    .min(1, 'Une commande doit contenir au moins un produit'),
  shippingFee: z.number().min(0).default(0),
  customerName: z.string().min(2, 'Nom du client requis').max(120),
  customerPhone: z.string().min(8, 'Téléphone du client requis').max(30),
  customerEmail: z.string().email().optional().nullable().or(z.literal('')),
  customerAddress: z.string().min(5, 'Adresse de livraison requise').max(400),
  customerCity: z.string().min(2, 'Ville de livraison requise').max(120),
  customerPostalCode: z.string().max(20).optional(),
  customerNotes: z.string().max(1000).optional(),
})

/** Commandes(list) — Listing avec périmètre par rôle. */
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
    const status = searchParams.get('status') || undefined
    const search = searchParams.get('search') || ''

    const where: Prisma.OrderWhereInput = {}

    if (session.user.role === 'RESELLER') {
      where.resellerId = session.user.resellerProfile?.id ?? '__none__'
    } else if (session.user.role === 'SUPPLIER') {
      where.supplierId = session.user.supplierProfile?.id ?? '__none__'
    } else if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Rôle non autorisé' }, { status: 403 })
    }

    if (status) where.status = status as OrderStatus
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          items: { include: { product: { select: { id: true, name: true } }, variant: true } },
          supplier: { select: { id: true, companyName: true } },
          reseller: { select: { id: true, companyName: true } },
          shipments: { select: { id: true, trackingCode: true, status: true, carrier: true } },
          commission: true,
          codCollection: true,
          deliveryCity: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ])

    return NextResponse.json({
      orders,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[Orders GET] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des commandes' },
      { status: 500 }
    )
  }
}

/** POST /api/orders — création d'une commande par le revendeur (§5.3). */
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'RESELLER') {
      return NextResponse.json(
        { error: 'Non autorisé - Réservé aux revendeurs' },
        { status: 403 }
      )
    }

    // Un compte revendeur sans profil ne peut pas être rattaché à une commande.
    const resellerProfileId = session.user.resellerProfile?.id
    if (!resellerProfileId) {
      return NextResponse.json(
        { error: "Votre profil revendeur est incomplet. Contactez l'administrateur." },
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

    const supplier = await prisma.supplierProfile.findUnique({
      where: { id: data.supplierId },
      select: { id: true, companyName: true },
    })
    if (!supplier) {
      return NextResponse.json({ error: 'Fournisseur introuvable' }, { status: 400 })
    }

    // Produits : tous doivent exister, être actifs et appartenir au fournisseur.
    const productIds = [...new Set(data.items.map((item) => item.productId))]
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, supplierId: supplier.id, status: 'ACTIVE' },
      include: { variants: true },
    })

    if (products.length !== productIds.length) {
      return NextResponse.json(
        { error: "Un ou plusieurs produits sont introuvables, inactifs ou n'appartiennent pas à ce fournisseur" },
        { status: 400 }
      )
    }

    const orderNumber = await generateUniqueOrderNumber()

    // Prix de gros figés au moment de la commande (§5.6).
    const pricedItems = data.items.map((item) => {
      const product = products.find((p) => p.id === item.productId)!
      const variant = item.variantId ? product.variants.find((v) => v.id === item.variantId) : null

      if (item.variantId && !variant) {
        throw new OrderValidationError(`La variante demandée n'existe pas pour « ${product.name} »`)
      }
      if (variant && variant.isActive === false) {
        throw new OrderValidationError(`La variante « ${variant.value} » n'est plus disponible`)
      }

      const supplierPrice = round2(
        Number(product.supplierPrice) + Number(variant?.additionalPrice ?? 0)
      )

      // Garde-fou : un prix de revente sous le prix de gros produirait une
      // marge négative que la plateforme ne couvre pas.
      if (item.resellerPrice < supplierPrice) {
        throw new OrderValidationError(
          `Le prix de vente de « ${product.name} » (${item.resellerPrice} MAD) est inférieur au prix fournisseur (${supplierPrice} MAD).`
        )
      }

      return {
        productId: product.id,
        variantId: variant?.id,
        quantity: item.quantity,
        supplierPrice,
        resellerPrice: item.resellerPrice,
      }
    })

    // Adresse de ramassage : celle choisie par le revendeur, sinon celle par
    // défaut du fournisseur.
    let pickupAddressId: string | undefined
    if (data.pickupAddressId) {
      const pickup = await prisma.pickupAddress.findFirst({
        where: { id: data.pickupAddressId, supplierId: supplier.id },
        select: { id: true },
      })
      if (!pickup) {
        return NextResponse.json(
          { error: "Adresse de ramassage invalide pour ce fournisseur" },
          { status: 400 }
        )
      }
      pickupAddressId = pickup.id
    } else {
      const fallback = await prisma.pickupAddress.findFirst({
        where: { supplierId: supplier.id, isDefault: true },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
      pickupAddressId = fallback?.id
    }

    // §6.3 : la ville de livraison doit être rattachable à un identifiant
    // AMEEX. On n'en bloque pas la commande pour autant : c'est la création
    // d'expédition qui l'exigera, et l'erreur sera explicite.
    const deliveryCity = await resolveCity(data.customerCity)

    const commissionRate = await getCommissionRate()
    const calc = calculateOrderCommission(pricedItems, commissionRate)

    const shippingFee = round2(data.shippingFee)
    // Le client final règle le prix de revente + la livraison (§5.7).
    const clientTotal = round2(calc.subtotal + shippingFee)

    const orderItems = calc.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? null,
      quantity: item.quantity,
      unitSupplierPrice: item.supplierPrice,
      unitResellerPrice: item.resellerPrice,
      unitCommission: round2(item.supplierPrice * commissionRate),
      totalSupplierPrice: item.totalSupplierPrice,
      totalResellerPrice: item.totalResellerPrice,
      totalCommission: item.totalCommission,
    }))

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          resellerId: resellerProfileId,
          supplierId: supplier.id,
          pickupAddressId: pickupAddressId ?? null,
          status: OrderStatus.PENDING,
          // `subtotal` porte le prix de revente des articles : c'est la base
          // du montant COD, hors livraison.
          subtotal: calc.subtotal,
          shippingFee,
          codAmount: clientTotal,
          commissionRate,
          commissionAmount: calc.totalCommission,
          grossMargin: calc.totalGrossMargin,
          netMargin: calc.totalNetMargin,
          currency: 'MAD',
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          customerEmail: data.customerEmail || null,
          customerAddress: data.customerAddress,
          customerCity: data.customerCity,
          customerPostalCode: data.customerPostalCode || null,
          customerNotes: data.customerNotes || null,
          deliveryCityId: deliveryCity?.id ?? null,
          items: { create: orderItems },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: OrderStatus.PENDING,
              actorId: session.user.id,
              actorRole: 'RESELLER',
              notes: 'Commande créée par le revendeur',
            },
          },
        },
        include: {
          items: { include: { product: true, variant: true } },
          supplier: true,
          reseller: true,
        },
      })

      // Commission due sur la commande (§5.7).
      await tx.commission.create({
        data: {
          orderId: created.id,
          rate: commissionRate,
          amount: calc.totalCommission,
          currency: 'MAD',
          status: 'PENDING',
          dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      })

      // Montant COD attendu (§5.7).
      await tx.codCollection.create({
        data: {
          orderId: created.id,
          expectedAmount: clientTotal,
          currency: 'MAD',
          status: 'EXPECTED',
        },
      })

      return created
    })

    void notifyOrderCreated(order.id)

    await audit({
      userId: session.user.id,
      action: 'ORDER_CREATED',
      entityType: 'Order',
      entityId: order.id,
      newData: {
        orderNumber: order.orderNumber,
        supplier: supplier.companyName,
        clientTotal,
        commission: calc.totalCommission,
      },
      ...getRequestMeta(request),
    })

    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    if (error instanceof OrderValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[Orders POST] Error:', error)
    return NextResponse.json(
      { error: "Erreur lors de la création de la commande" },
      { status: 500 }
    )
  }
}

class OrderValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OrderValidationError'
  }
}

/**
 * Numéro de commande unique : `FAB-<année>-<séquence sur 6 chiffres>`.
 * La séquence repart de 1 chaque année et les commandes existantes sont
 * lues pour éviter toute collision.
 */
async function generateUniqueOrderNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `FAB-${year}-`

  const last = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  })

  const lastSequence = last ? parseInt(last.orderNumber.slice(prefix.length), 10) : 0
  const next = (Number.isFinite(lastSequence) ? lastSequence : 0) + 1

  return `${prefix}${String(next).padStart(6, '0')}`
}