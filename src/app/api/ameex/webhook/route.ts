import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { AmexAdapter } from '@/lib/ameex/adapter'
import { resolveAmeexCredentials } from '@/lib/ameex/credentials'
import { applyTrackingUpdate } from '@/lib/shipments/tracking'
import { notifyOrderStatusChanged } from '@/lib/notifications/service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ameex/webhook
 *
 * AMEEX y signale les changements de statut d'un colis. Le corps est lu une
 * seule fois en texte brut : la signature porte sur les octets exacts, donc
 * toute re-sérialisation invaliderait le HMAC.
 */
export async function POST(request: Request) {
  const headerList = headers()
  const signature =
    headerList.get('x-ameex-signature') ||
    headerList.get('x-signature') ||
    headerList.get('x-ameex-signature-sha256') ||
    ''

  const rawBody = await request.text()

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ success: false, error: 'Payload JSON invalide' }, { status: 400 })
  }

  const credentials = await resolveAmeexCredentials().catch((error) => {
    console.error('[AMEEX Webhook] credentials error:', error)
    return null
  })

  if (!credentials) {
    return NextResponse.json(
      { success: false, error: 'Intégration AMEEX non configurée' },
      { status: 503 }
    )
  }

  // Un secret webhook non configuré doit faire rejeter la requête : mieux vaut
  // un 503 visible qu'un point d'entrée ouvert à tous.
  if (!credentials.webhookSecret) {
    console.error('[AMEEX Webhook] Rejet : aucun webhookSecret configuré')
    return NextResponse.json(
      { success: false, error: 'Secret webhook non configuré' },
      { status: 503 }
    )
  }

  const adapter = await AmexAdapter.create().catch(() => null)
  if (!adapter) {
    return NextResponse.json({ success: false, error: 'Intégration AMEEX indisponible' }, { status: 503 })
  }

  if (!adapter.verifyWebhookSignature(rawBody, signature, credentials.webhookSecret)) {
    console.error('[AMEEX Webhook] Signature invalide')
    return NextResponse.json({ success: false, error: 'Signature webhook invalide' }, { status: 401 })
  }

  const eventType =
    (body.event_type as string) || (body.eventType as string) || (body.type as string) || 'unknown'
  const parcelCode =
    (body.parcel_code as string) ||
    (body.ParcelCode as string) ||
    (body.parcelCode as string) ||
    (body.tracking_code as string) ||
    ''
  const rawStatus =
    (body.status as string) ||
    (body.statut as string) ||
    (body.Status as string) ||
    (body.state as string) ||
    ''
  const deliveredAt = (body.delivered_at as string) || (body.deliveredAt as string) || null

  // §6.4 : le Code Suivi est la clé de rattachement. Sans lui, l'événement est
  // journalisé mais aucune commande n'est touchée.
  const shipment = parcelCode
    ? await prisma.shipment.findUnique({
        where: { trackingCode: parcelCode },
        include: { order: { select: { id: true, status: true } } },
      })
    : null

  await logWebhook({
    integrationId: await getIntegrationId(),
    shipmentId: shipment?.id ?? null,
    responseBody: shipment
      ? { event: eventType, rawStatus }
      : { event: eventType, message: `Aucun colis trouvé pour ${parcelCode || 'code manquant'}` },
  })

  if (!shipment) {
    return NextResponse.json(
      { success: true, message: `Webhook ${eventType} reçu, colis non suivi` },
      { status: 200 }
    )
  }

  if (shipment.isManual) {
    return NextResponse.json(
      {
        success: true,
        message: `Webhook ${eventType} ignoré : expédition saisie manuellement`,
      },
      { status: 200 }
    )
  }

  try {
    const applied = await applyTrackingUpdate({
      shipmentId: shipment.id,
      rawStatus,
      deliveredAt,
      isSystem: true,
    })

    if (applied.orderStatus && applied.orderStatus !== shipment.order.status) {
      // applyTrackingUpdate applique déjà la transition ; la notification
      // enrichie l'événement avec l'ordre réellement modifié.
      const order = await prisma.order.findUnique({
        where: { id: shipment.orderId },
        select: { id: true, status: true },
      })
      if (order && order.status === applied.orderStatus) {
        void notifyOrderStatusChanged(
          order.id,
          shipment.order.status,
          applied.orderStatus as never
        )
      }
    }

    return NextResponse.json({
      success: true,
      message: `Webhook ${eventType} traité pour le colis ${parcelCode}`,
      shipmentStatus: applied.shipmentStatus,
      orderStatus: applied.orderStatus,
    })
  } catch (error) {
    console.error('[AMEEX Webhook] Erreur de traitement:', error)
    return NextResponse.json(
      { success: false, error: 'Erreur de traitement du webhook' },
      { status: 500 }
    )
  }
}

/** Sonde de disponibilité. */
export async function GET() {
  const configured = await resolveAmeexCredentials()
    .then((creds) => Boolean(creds?.webhookSecret))
    .catch(() => false)

  return NextResponse.json({
    success: true,
    message: 'Endpoint webhook AMEEX actif. Envoyez des requêtes POST pour tester.',
    signatureEnforced: configured,
  })
}

async function getIntegrationId(): Promise<string> {
  const integration = await prisma.courierIntegration.findFirst({
    where: { name: 'AMEEX' },
    select: { id: true },
  })
  return integration?.id ?? ''
}

async function logWebhook(params: {
  integrationId: string
  shipmentId: string | null
  responseBody: Prisma.InputJsonValue
}): Promise<void> {
  if (!params.integrationId) return
  try {
    await prisma.courierApiLog.create({
      data: {
        integrationId: params.integrationId,
        shipmentId: params.shipmentId,
        method: 'POST',
        endpoint: '/api/ameex/webhook',
        responseBody: params.responseBody,
        statusCode: 200,
      },
    })
  } catch (error) {
    console.error('[AMEEX Webhook] journalisation impossible', error)
  }
}