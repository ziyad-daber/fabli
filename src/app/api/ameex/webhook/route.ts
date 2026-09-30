import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { createAmeexAdapter } from '@/lib/ameex/adapter'
import type { Prisma, OrderStatus, ShipmentStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ameex/webhook
 *
 * AMEEX calls this endpoint to report parcel status changes. The body is read
 * exactly once as text so the raw bytes can be HMAC-verified, then parsed.
 */
export async function POST(request: Request) {
  const startedAt = Date.now()
  const headerList = headers()
  const signature = headerList.get('x-ameex-signature') || headerList.get('x-signature') || ''

  // Read the body ONCE as raw text - parsing first would consume the stream
  const rawBody = await request.text()

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ success: false, error: 'Payload JSON invalide' }, { status: 400 })
  }

  const integration = await prisma.courierIntegration.findFirst({
    where: { name: 'AMEEX' },
  })

  if (!integration) {
    return NextResponse.json(
      { success: false, error: 'Intégration AMEEX non configurée' },
      { status: 503 }
    )
  }

  const config = (integration.config as { webhookSecret?: string } | null) ?? {}
  const webhookSecret = config.webhookSecret || ''

  // A configured secret is mandatory: never accept unsigned webhooks
  if (!webhookSecret) {
    console.error('[AMEEX Webhook] Rejet : aucun webhookSecret configuré')
    return NextResponse.json(
      { success: false, error: 'Secret webhook non configuré' },
      { status: 503 }
    )
  }

  const adapter = await createAmeexAdapter()

  if (!adapter.verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    console.error('[AMEEX Webhook] Signature invalide')
    return NextResponse.json({ success: false, error: 'Invalid webhook signature' }, { status: 401 })
  }

  const eventType =
    (body.event_type as string) || (body.eventType as string) || (body.type as string) || 'unknown'
  const parcelCode =
    (body.parcel_code as string) ||
    (body.ParcelCode as string) ||
    (body.parcelCode as string) ||
    ''
  const rawStatus =
    (body.status as string) ||
    (body.statut as string) ||
    (body.Status as string) ||
    ''

  const shipment = parcelCode
    ? await prisma.shipment.findUnique({
        where: { trackingCode: parcelCode },
        include: { order: { select: { status: true } } },
      })
    : null

  const payload = body as Prisma.InputJsonObject

  if (!shipment) {
    await prisma.courierApiLog.create({
      data: {
        integrationId: integration.id,
        method: 'POST',
        endpoint: '/api/ameex/webhook',
        requestBody: payload,
        responseBody: { message: `Aucun colis trouvé pour ${parcelCode || 'code manquant'}` },
        statusCode: 200,
        durationMs: Date.now() - startedAt,
      },
    })

    return NextResponse.json(
      { success: true, message: `Webhook ${eventType} reçu, colis non suivi` },
      { status: 200 }
    )
  }

  const shipmentStatus: ShipmentStatus = adapter.mapShipmentStatus(rawStatus)
  const orderStatus: OrderStatus | null = adapter.mapOrderStatus(shipmentStatus)
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.shipment.update({
      where: { id: shipment.id },
      data: {
        status: shipmentStatus,
        lastTrackingAt: now,
        ...(shipmentStatus === 'PICKED_UP' ? { pickedUpAt: now } : {}),
        ...(shipmentStatus === 'DELIVERED' ? { deliveredAt: now } : {}),
      },
    })

    if (orderStatus && orderStatus !== shipment.order.status) {
      const order = await tx.order.findUnique({
        where: { id: shipment.orderId },
        include: { statusHistory: { orderBy: { createdAt: 'desc' }, take: 1 } },
      })

      if (order) {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: orderStatus,
            ...(orderStatus === 'DELIVERED' ? { deliveredAt: now } : {}),
          },
        })

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: orderStatus,
            actorId: 'system:ameex',
            actorRole: 'ADMIN',
            notes: `Mise à jour automatique via webhook AMEEX (${rawStatus || 'statut inconnu'})`,
          },
        })

        if (orderStatus === 'DELIVERED') {
          await tx.codCollection.updateMany({
            where: { orderId: order.id },
            data: { status: 'COLLECTED', collectedAt: now },
          })
        }
      }
    }
  })

  await prisma.courierApiLog.create({
    data: {
      integrationId: integration.id,
      shipmentId: shipment.id,
      method: 'POST',
      endpoint: '/api/ameex/webhook',
      requestBody: payload,
      responseBody: { status: shipmentStatus, orderStatus },
      statusCode: 200,
      durationMs: Date.now() - startedAt,
    },
  })

  return NextResponse.json({
    success: true,
    message: `Webhook ${eventType} traité pour le colis ${parcelCode}`,
    shipmentStatus,
    orderStatus,
  })
}

// GET /api/ameex/webhook - health probe
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Endpoint webhook AMEEX actif. Envoyez des requêtes POST pour tester.',
  })
}
