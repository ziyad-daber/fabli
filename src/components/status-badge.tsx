import { Badge } from '@/components/ui/badge'
import { ORDER_STATUS_LABELS, type OrderStatusType } from '@/lib/orders/status'

const ORDER_STYLES: Record<OrderStatusType, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  ACCEPTED: 'bg-blue-100 text-blue-800',
  IN_PRODUCTION: 'bg-blue-100 text-blue-800',
  READY_TO_SHIP: 'bg-indigo-100 text-indigo-800',
  SHIPMENT_CREATED: 'bg-violet-100 text-violet-800',
  IN_TRANSIT: 'bg-sky-100 text-sky-800',
  DELIVERED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-700',
  DELIVERY_FAILED: 'bg-orange-100 text-orange-800',
  RETURNED: 'bg-gray-200 text-gray-800',
  SHIPMENT_ERROR: 'bg-red-200 text-red-900',
}

const SHIPMENT_LABELS: Record<string, string> = {
  CREATED: 'Créée',
  PICKED_UP: 'Collectée',
  IN_TRANSIT: 'En transit',
  OUT_FOR_DELIVERY: 'En cours de livraison',
  DELIVERED: 'Livrée',
  DELIVERY_FAILED: 'Échec de livraison',
  RETURNED: 'Retournée',
  ERROR: 'Erreur',
}

const COMMISSION_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  DUE: 'Dûe',
  PAID: 'Réglée',
  DISPUTED: 'Contestée',
  REFUNDED: 'Remboursée',
}

const SETTLEMENT_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  PROCESSING: 'En cours',
  COMPLETED: 'Payé',
  FAILED: 'Échec',
  DISPUTED: 'Contesté',
}

const COD_LABELS: Record<string, string> = {
  EXPECTED: 'Attendu',
  COLLECTED: 'Encaissé',
  SETTLED: 'Reversé',
  DISCREPANCY: 'Écart',
  REFUNDED: 'Remboursé',
}

const USER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
  SUSPENDED: 'Suspendu',
  PENDING_VERIFICATION: 'En attente de validation',
}

const PRODUCT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  ACTIVE: 'Actif',
  DISABLED: 'Désactivé',
}

type StyleMap = Record<string, string>

function styleFor(map: StyleMap, status: string): string {
  return (
    map[status] ??
    Object.entries(map).find(([, style]) => style.startsWith('bg-gray'))?.[1] ??
    'bg-gray-100 text-gray-800'
  )
}

function makeStatusBadge(
  labels: Record<string, string>,
  styles: StyleMap,
  fallback: 'default' | 'secondary' = 'default'
) {
  return function StatusBadge({ status, className }: { status: string; className?: string }) {
    return (
      <Badge variant={fallback} className={`${styleFor(styles, status)} ${className ?? ''}`}>
        {labels[status] ?? status}
      </Badge>
    )
  }
}

export const OrderStatusBadge = ({ status }: { status: string }) => (
  <Badge className={styleFor(ORDER_STYLES, status)}>
    {ORDER_STATUS_LABELS[status as OrderStatusType] ?? status}
  </Badge>
)

export const ShipmentStatusBadge = makeStatusBadge(SHIPMENT_LABELS, {})
export const CommissionStatusBadge = makeStatusBadge(COMMISSION_LABELS, {})
export const SettlementStatusBadge = makeStatusBadge(SETTLEMENT_LABELS, {})
export const CodStatusBadge = makeStatusBadge(COD_LABELS, {})
export const UserStatusBadge = makeStatusBadge(USER_STATUS_LABELS, {})
export const ProductStatusBadge = makeStatusBadge(PRODUCT_STATUS_LABELS, {})

export {
  ORDER_STATUS_LABELS,
  SHIPMENT_LABELS,
  COMMISSION_LABELS,
  SETTLEMENT_LABELS,
  COD_LABELS,
  USER_STATUS_LABELS,
  PRODUCT_STATUS_LABELS,
}