export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { refreshShipmentTracking } from '@/lib/shipments/tracking'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/shipments/[id] — détail d'une expédition, avec son historique
 * d'appels API. Le périmètre suit le rôle de l'utilisateur (§14.10).
 */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { id } = await params

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            customerName: true,
            customerPhone: true,
            customerAddress: true,
            customerCity: true,
            customerPostalCode: true,
            codAmount: true,
            currency: true,
            supplierId: true,
            resellerId: true,
            supplier: { select: { companyName: true } },
          },
        },
        apiLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    })

    if (!shipment) {
      return NextResponse.json({ error: 'Expédition introuvable' }, { status: 404 })
    }

    const role = session.user.role
    if (
      role === 'SUPPLIER' &&
      shipment.order.supplierId !== session.user.supplierProfile?.id
    ) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    if (
      role === 'RESELLER' &&
      shipment.order.resellerId !== session.user.resellerProfile?.id
    ) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    if (role !== 'ADMIN' && role !== 'SUPPLIER' && role !== 'RESELLER') {
      return NextResponse.json({ error: 'Rôle non autorisé' }, { status: 403 })
    }

    // Les journaux d'API contiennent des échanges avec le transporteur :
    // réservés à l'administrateur (§6.5).
    const { apiLogs, ...rest } = shipment

    return NextResponse.json({
      ...rest,
      apiLogs: role === 'ADMIN' ? apiLogs : undefined,
    })
  } catch (error) {
    console.error('[Shipment GET] Error:', error)
    return NextResponse.json({ error: "Erreur lors de la récupération de l'expédition" }, { status: 500 })
  }
}

/**
 * POST /api/shipments/[id]/track — actualisation ponctuelle du suivi.
 * Utilisée quand AMEEX ne pousse pas de webhook exploitable, ou pour forcer
 * un rafraîchissement après une erreur.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { id } = await params

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      select: { id: true, order: { select: { supplierId: true, resellerId: true } } },
    })
    if (!shipment) {
      return NextResponse.json({ error: 'Expédition introuvable' }, { status: 404 })
    }

    const role = session.user.role
    const allowed =
      role === 'ADMIN' ||
      (role === 'SUPPLIER' && shipment.order.supplierId === session.user.supplierProfile?.id) ||
      (role === 'RESELLER' && shipment.order.resellerId === session.user.resellerProfile?.id)

    if (!allowed) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const result = await refreshShipmentTracking(id, {
      actorId: session.user.id,
      request,
    })

    if (result.skipped) {
      return NextResponse.json({ success: true, skipped: result.skipped })
    }
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 })
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      orderStatus: result.orderStatus ?? null,
    })
  } catch (error) {
    console.error('[Shipment Track POST] Error:', error)
    return NextResponse.json({ error: 'Erreur lors de la consultation du suivi' }, { status: 500 })
  }
}