export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createManualShipment,
  createShipmentForOrder,
  OrderTransitionError,
  ShipmentCreationError,
} from '@/lib/shipments/service'

const createSchema = z.object({
  orderId: z.string().min(1, 'Identifiant de commande manquant'),
  weight: z.number().positive().optional(),
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
})

/**
 * POST /api/shipments — création d'une expédition via le compte AMEEX central.
 *
 * Autorisé au fournisseur propriétaire de la commande et à l'administrateur.
 * Le Code Suivi n'est jamais fourni par le client : il vient de la réponse
 * AMEEX (§6.2).
 */
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const role = session.user.role
    if (role !== 'SUPPLIER' && role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Non autorisé - Réservé aux fournisseurs et administrateurs' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validation = createSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { orderId, weight, length, width, height } = validation.data

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, supplierId: true, orderNumber: true },
    })
    if (!order) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }

    if (role === 'SUPPLIER' && order.supplierId !== session.user.supplierProfile?.id) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const result = await createShipmentForOrder({
      orderId,
      actorId: session.user.id,
      actorRole: role === 'ADMIN' ? 'ADMIN' : 'SUPPLIER',
      request,
      packageOverride: { weight, length, width, height },
    })

    return NextResponse.json(
      {
        success: true,
        reused: result.reused,
        orderNumber: result.orderNumber,
        shipment: {
          id: result.shipment.id,
          trackingCode: result.shipment.trackingCode,
          labelUrl: result.shipment.labelUrl,
          carrier: result.shipment.carrier,
          status: result.shipment.status,
        },
      },
      { status: result.reused ? 200 : 201 }
    )
  } catch (error) {
    if (error instanceof ShipmentCreationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    if (error instanceof OrderTransitionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('[Shipments POST] Error:', error)
    return NextResponse.json(
      { error: "Erreur lors de la création de l'expédition" },
      { status: 500 }
    )
  }
}

const manualSchema = z.object({
  orderId: z.string().min(1),
  trackingCode: z.string().min(4, 'Le Code Suivi est obligatoire').max(64),
  carrier: z.string().max(64).optional(),
  externalId: z.string().max(128).optional(),
  labelUrl: z.string().url('URL d\'étiquette invalide').or(z.literal('')).optional(),
  notes: z.string().max(500).optional(),
})

/**
 * POST /api/shipments — mode manuel (§6.5).
 * Réservé à l'administrateur, utilisé quand l'API AMEEX est indisponible.
 */
export async function PUT(request: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const body = await request.json()
    const validation = manualSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const shipment = await createManualShipment({
      orderId: validation.data.orderId,
      trackingCode: validation.data.trackingCode,
      carrier: validation.data.carrier,
      externalId: validation.data.externalId,
      labelUrl: validation.data.labelUrl || undefined,
      notes: validation.data.notes,
      actorId: session.user.id,
      request,
    })

    return NextResponse.json(
      {
        success: true,
        shipment: {
          id: shipment.id,
          trackingCode: shipment.trackingCode,
          carrier: shipment.carrier,
          status: shipment.status,
          isManual: shipment.isManual,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof ShipmentCreationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    if (error instanceof OrderTransitionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('[Shipments PUT] Error:', error)
    return NextResponse.json({ error: "Erreur lors de l'enregistrement de l'expédition" }, { status: 500 })
  }
}

/**
 * GET /api/shipments — liste des expéditions visibles par l'utilisateur.
 * Le périmètre est strictement rôle-based (§14.10).
 */
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || undefined

    const orderFilter =
      session.user.role === 'SUPPLIER'
        ? { supplierId: session.user.supplierProfile?.id }
        : session.user.role === 'RESELLER'
          ? { resellerId: session.user.resellerProfile?.id }
          : {}

    const where: Record<string, unknown> = { order: orderFilter }
    if (status) where.status = status
    if (search) {
      where.OR = [
        { trackingCode: { contains: search, mode: 'insensitive' } },
        { order: { orderNumber: { contains: search, mode: 'insensitive' } } },
        { order: { customerName: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              customerName: true,
              customerCity: true,
              codAmount: true,
              currency: true,
              supplier: { select: { id: true, companyName: true } },
              reseller: { select: { id: true, companyName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shipment.count({ where }),
    ])

    return NextResponse.json({
      shipments,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[Shipments GET] Error:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération des expéditions' }, { status: 500 })
  }
}