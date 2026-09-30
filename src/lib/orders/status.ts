import type { OrderStatus as OrderStatusType, UserRole } from '@prisma/client'

export { OrderStatus } from '@prisma/client'

/**
 * Matrice de transitions de commande (§5.5).
 *
 *   En attente → Acceptée → En fabrication → Prête à expédier
 *              → Expédition créée → En transit → Livrée
 *
 * Statuts complémentaires : Refusée, Annulée, Échec de livraison, Retour,
 * Erreur d'expédition.
 *
 * Extraite dans un module dédié pour être testable et partagé entre la route
 * de commande et le webhook AMEEX.
 */
export const ORDER_STATUS_LABELS: Record<OrderStatusType, string> = {
  PENDING: 'En attente',
  ACCEPTED: 'Acceptée',
  IN_PRODUCTION: 'En fabrication',
  READY_TO_SHIP: 'Prête à expédier',
  SHIPMENT_CREATED: 'Expédition créée',
  IN_TRANSIT: 'En transit',
  DELIVERED: 'Livrée',
  REJECTED: 'Refusée',
  CANCELLED: 'Annulée',
  DELIVERY_FAILED: 'Échec de livraison',
  RETURNED: 'Retour',
  SHIPMENT_ERROR: 'Erreur d\'expédition',
}

export const VALID_TRANSITIONS: Record<OrderStatusType, OrderStatusType[]> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['IN_PRODUCTION', 'REJECTED', 'CANCELLED'],
  IN_PRODUCTION: ['READY_TO_SHIP', 'CANCELLED'],
  READY_TO_SHIP: ['SHIPMENT_CREATED', 'CANCELLED'],
  SHIPMENT_CREATED: ['IN_TRANSIT', 'CANCELLED', 'SHIPMENT_ERROR'],
  IN_TRANSIT: ['DELIVERED', 'DELIVERY_FAILED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  REJECTED: [],
  CANCELLED: [],
  DELIVERY_FAILED: ['RETURNED', 'IN_TRANSIT'],
  RETURNED: [],
  SHIPMENT_ERROR: ['READY_TO_SHIP', 'CANCELLED'],
}

export function canTransition(from: OrderStatusType, to: OrderStatusType): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to)
}

/** Un acteur système (webhook transporteur) peut imposer les transitions liées au transport. */
export const SYSTEM_ALLOWED: OrderStatusType[] = [
  'IN_TRANSIT',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RETURNED',
  'SHIPMENT_ERROR',
]

export function canSystemTransition(from: OrderStatusType, to: OrderStatusType): boolean {
  return SYSTEM_ALLOWED.includes(to) && (VALID_TRANSITIONS[from] ?? []).includes(to)
}

/**
 * Statuts que le fournisseur est autorisé à poser lui-même : il prend la
 * commande en charge et la prépare, il ne gère ni l'expédition ni la livraison.
 */
export const SUPPLIER_ALLOWED: OrderStatusType[] = [
  'ACCEPTED',
  'IN_PRODUCTION',
  'READY_TO_SHIP',
  'REJECTED',
  'CANCELLED',
]

export function statusLabel(status: OrderStatusType): string {
  return ORDER_STATUS_LABELS[status] ?? status
}

/** Horodatage métier associé à chaque statut. */
export function statusTimestampField(status: OrderStatusType): string | null {
  switch (status) {
    case 'ACCEPTED':
      return 'acceptedAt'
    case 'IN_PRODUCTION':
      return 'producedAt'
    case 'READY_TO_SHIP':
      return 'readyToShipAt'
    case 'SHIPMENT_CREATED':
      return 'shippedAt'
    case 'DELIVERED':
      return 'deliveredAt'
    default:
      return null
  }
}

export type { OrderStatusType, UserRole }