import { prisma } from '@/lib/db/prisma'
import { AmexAdapter } from '@/lib/ameex/adapter'
import { applyOrderTransition } from '@/lib/orders/transition'
import { audit, getRequestMeta } from '@/lib/utils/audit'

/**
 * Actualisation du suivi d'une expédition (§6.2 étape 6).
 *
 * Deux sources sont prévues par le cahier des charges : le webhook (prioritaire,
 * cf. /api/ameex/webhook) et, si AMEEX ne propose pas de webhook exploitable,
 * l'interrogation périodique. Les deux convergent vers le même mapping de
 * statut, donc le même code d'application.
 */

export interface RefreshResult {
  ok: boolean
  status?: string
  orderStatus?: string | null
  error?: string
  skipped?: string
}

/**
 * Applique le statut AMEEX à l'expédition puis, si nécessaire, à la commande.
 * Fonction partagée par le webhook et l'interrogation à la demande.
 */
export async function applyTrackingUpdate(params: {
  shipmentId: string
  rawStatus: string
  deliveredAt?: string | null
  isSystem?: boolean
}): Promise<{ shipmentStatus: string; orderStatus: string | null }> {
  const adapter = await AmexAdapter.create()
  const shipmentStatus = adapter.mapShipmentStatus(params.rawStatus)
  const orderStatus = adapter.mapOrderStatus(shipmentStatus as never)
  const now = new Date()

  const shipment = await prisma.shipment.findUnique({
    where: { id: params.shipmentId },
    select: { id: true, orderId: true, status: true, isManual: true },
  })
  if (!shipment) {
    return { shipmentStatus: 'ERROR', orderStatus: null }
  }

  await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      status: shipmentStatus as never,
      lastTrackingAt: now,
      errorMessage: shipmentStatus === 'ERROR' ? `Statut AMEEX non reconnu : ${params.rawStatus}` : null,
      ...(shipmentStatus === 'PICKED_UP' ? { pickedUpAt: now } : {}),
      ...(shipmentStatus === 'DELIVERED'
        ? { deliveredAt: params.deliveredAt ? new Date(params.deliveredAt) : now }
        : {}),
    },
  })

  // Une saisie manuelle n'est pas suivie par l'API : on n'invente pas d'état.
  if (shipment.isManual) {
    return { shipmentStatus, orderStatus: null }
  }

  if (orderStatus) {
    const order = await prisma.order.findUnique({
      where: { id: shipment.orderId },
      select: { status: true },
    })
    if (order && order.status !== orderStatus) {
      await applyOrderTransition({
        orderId: shipment.orderId,
        to: orderStatus,
        actorId: 'system:ameex',
        actorRole: 'ADMIN',
        notes: `Mise à jour automatique du suivi AMEEX (${params.rawStatus || 'statut inconnu'})`,
        isSystem: true,
      })
    }
  }

  return { shipmentStatus, orderStatus }
}

/**
 * Interroge AMEEX pour un colis et applique le résultat.
 * Une expédition saisie manuellement n'est pas interrogée : l'API ne connaît
 * pas son Code Suivi.
 */
export async function refreshShipmentTracking(
  shipmentId: string,
  options: { actorId?: string; request?: Request } = {}
): Promise<RefreshResult> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { order: { select: { id: true, orderNumber: true } } },
  })

  if (!shipment) return { ok: false, error: 'Expédition introuvable' }
  if (shipment.isManual) {
    return { ok: false, skipped: 'Expédition saisie manuellement : suivi non disponible via AMEEX' }
  }
  if (!shipment.trackingCode) {
    return { ok: false, skipped: 'Aucun Code Suivi enregistré pour cette expédition' }
  }

  const adapter = await AmexAdapter.create().catch(() => null)
  if (!adapter) {
    return { ok: false, error: "L'intégration AMEEX n'est pas configurée" }
  }

  const tracking = await adapter.getTracking(shipment.trackingCode, shipment.id)
  if (!tracking.success) {
    return { ok: false, error: tracking.error ?? 'Suivi indisponible' }
  }

  const applied = await applyTrackingUpdate({
    shipmentId: shipment.id,
    rawStatus: tracking.status,
    deliveredAt: tracking.deliveredAt,
  })

  if (options.actorId) {
    await audit({
      userId: options.actorId,
      action: 'SHIPMENT_TRACKING_REFRESHED',
      entityType: 'Shipment',
      entityId: shipment.id,
      newData: {
        orderNumber: shipment.order.orderNumber,
        trackingCode: shipment.trackingCode,
        rawStatus: tracking.status,
        shipmentStatus: applied.shipmentStatus,
        orderStatus: applied.orderStatus,
      },
      ...getRequestMeta(options.request),
    })
  }

  return {
    ok: true,
    status: applied.shipmentStatus,
    orderStatus: applied.orderStatus,
  }
}

/**
 * Interrogation périodique : relève les expéditions en cours dont le suivi
 * n'a pas été rafraîchi depuis `maxAgeMinutes`. À appeler depuis une tâche
 * planifiée (cron) ou un worker ; sans dépendance externe, le point d'entrée
 * admin `/api/admin/shipments/refresh` déclenche la même fonction.
 */
export async function refreshStaleShipments(maxAgeMinutes = 30): Promise<{
  scanned: number
  updated: number
  failed: number
}> {
  const threshold = new Date(Date.now() - maxAgeMinutes * 60 * 1000)

  const stale = await prisma.shipment.findMany({
    where: {
      isManual: false,
      status: { in: ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] },
      OR: [{ lastTrackingAt: null }, { lastTrackingAt: { lt: threshold } }],
    },
    select: { id: true },
    take: 100,
  })

  let updated = 0
  let failed = 0

  for (const shipment of stale) {
    const result = await refreshShipmentTracking(shipment.id)
    if (result.ok) updated += 1
    else failed += 1
  }

  return { scanned: stale.length, updated, failed }
}