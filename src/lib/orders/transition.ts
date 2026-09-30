import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import {
  canSystemTransition,
  canTransition,
  statusTimestampField,
  SUPPLIER_ALLOWED,
  type OrderStatusType,
} from '@/lib/orders/status'
import { notifyOrderStatusChanged } from '@/lib/notifications/service'

export class OrderTransitionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 400
  ) {
    super(message)
    this.name = 'OrderTransitionError'
  }
}

interface ApplyTransitionParams {
  orderId: string
  to: OrderStatusType
  actorId: string
  actorRole: 'ADMIN' | 'SUPPLIER' | 'RESELLER'
  notes?: string
  /** Le webhook transporteur n'est pas soumis au même jeu de transitions. */
  isSystem?: boolean
  /** Mise à jour effectuée dans la même transaction que la transition. */
  tx?: Prisma.TransactionClient
}

export interface TransitionResult {
  from: OrderStatusType
  to: OrderStatusType
  shipmentId?: string
}

/**
 * Applique une transition de commande : contrôle de la matrice, écriture de
 * l'historique horodaté et attribution à l'acteur (§5.5).
 *
 * La transition et l'historique partagent la même transaction ; la
 * notification est déclenchée après coup, pour ne pas lier l'envoi d'un
 * message à l'état de la base.
 */
export async function applyOrderTransition(params: ApplyTransitionParams): Promise<TransitionResult> {
  const client = params.tx ?? prisma

  const order = await client.order.findUnique({
    where: { id: params.orderId },
    select: { id: true, status: true },
  })
  if (!order) throw new OrderTransitionError('Commande introuvable', 404)

  if (order.status === params.to) {
    return { from: order.status, to: params.to }
  }

  const allowed = params.isSystem
    ? canSystemTransition(order.status, params.to)
    : canTransition(order.status, params.to)

  if (!allowed) {
    throw new OrderTransitionError(
      `Transition invalide de ${order.status} vers ${params.to}`,
      400
    )
  }

  const now = new Date()
  const data: Record<string, unknown> = { status: params.to }
  const timestampField = statusTimestampField(params.to)
  if (timestampField) data[timestampField] = now

  await client.order.update({ where: { id: params.orderId }, data })

  await client.orderStatusHistory.create({
    data: {
      orderId: params.orderId,
      fromStatus: order.status,
      toStatus: params.to,
      actorId: params.actorId,
      actorRole: params.actorRole,
      notes: params.notes ?? null,
    },
  })

  // COD marqué encaissé à la livraison (§5.7). Le montant réellement
  // encaissé reste à confirmer par l'administrateur lors du rapprochement.
  if (params.to === 'DELIVERED') {
    await client.codCollection.updateMany({
      where: { orderId: params.orderId, status: 'EXPECTED' },
      data: { status: 'COLLECTED', collectedAt: now },
    })
  }

  if (!params.tx) {
    void notifyOrderStatusChanged(params.orderId, order.status, params.to)
  }

  return { from: order.status, to: params.to }
}

export function assertSupplierAllowed(to: OrderStatusType): void {
  if (!SUPPLIER_ALLOWED.includes(to)) {
    throw new OrderTransitionError("Action non autorisée pour ce statut", 403)
  }
}