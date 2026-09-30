export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { refreshShipmentTracking, refreshStaleShipments } from '@/lib/shipments/tracking'

// GET /api/admin/shipments - List shipments with filters (admin only)
export async function GET(request: Request) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Non autorisé - Réservé aux administrateurs' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || undefined
    const carrier = searchParams.get('carrier') || undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined

    // Calculate skip for pagination
    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}

    // Search by tracking code or order number
    if (search) {
      where.OR = [
        { trackingCode: { contains: search, mode: 'insensitive' } },
        { order: { orderNumber: { contains: search, mode: 'insensitive' } } },
        { order: { customerName: { contains: search, mode: 'insensitive' } } },
      ]
    }

    // Filter by status
    if (status) {
      where.status = status
    }

    // Filter by carrier
    if (carrier) {
      where.carrier = carrier
    }

    // Filter by date range (createdAt)
    if (startDate) {
      where.createdAt = {
        ...(where.createdAt || {}),
        gte: new Date(startDate)
      }
    }
    if (endDate) {
      where.createdAt = {
        ...(where.createdAt || {}),
        lte: new Date(endDate)
      }
    }

    // Get shipments with pagination
    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              customerName: true,
              customerPhone: true,
              customerAddress: true,
              customerCity: true,
              customerPostalCode: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.shipment.count({ where })
    ])

    return NextResponse.json({
      shipments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('[Admin Shipments GET] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des envois' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/shipments — relance le suivi des expéditions dont les
 * données sont périmées (§6.2 étape 6 : « actualisé manuellement ou par
 * interrogation périodique si autorisée »).
 *
 * `shipmentId` cible une expédition précise, sinon le lot de colis dont le
 * suivi date de plus de `maxAgeMinutes`.
 */
export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const schema = z.object({
      shipmentId: z.string().optional(),
      maxAgeMinutes: z.number().int().positive().max(1440).default(30),
    })
    const validation = schema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
    }

    if (validation.data.shipmentId) {
      const result = await refreshShipmentTracking(validation.data.shipmentId, {
        actorId: session.user.id,
        request,
      })
      return NextResponse.json({ success: result.ok, ...result })
    }

    const summary = await refreshStaleShipments(validation.data.maxAgeMinutes)

    return NextResponse.json({ success: true, ...summary })
  } catch (error) {
    console.error('[Admin Shipments POST] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la relance du suivi' },
      { status: 500 }
    )
  }
}

// We don't need POST, PATCH, DELETE for shipments in admin because:
// - Shipments are created via the AMEEX integration (supplier flow)
// - Status updates come from webhooks
// - Label downloads are handled client-side
// - Deletion would be rare and should go through proper channels
// But if needed in the future, we can add specific endpoints.