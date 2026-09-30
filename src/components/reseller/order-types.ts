/**
 * Types partagés par les écrans revendeur « commandes » : le contrat de
 * /api/orders est identique pour la liste et le détail, on ne le décrit qu'une fois.
 */

export type OrderStatusType =
  | 'PENDING'
  | 'ACCEPTED'
  | 'IN_PRODUCTION'
  | 'READY_TO_SHIP'
  | 'SHIPMENT_CREATED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'DELIVERY_FAILED'
  | 'RETURNED'
  | 'SHIPMENT_ERROR'

/** Les montants Prisma (Decimal) arrivent en string : toujours passer par Number(). */
export type Decimal = string | number

export interface OrderItem {
  id: string
  productId: string
  variantId: string | null
  quantity: number
  unitSupplierPrice: Decimal
  unitResellerPrice: Decimal
  totalSupplierPrice: Decimal
  totalResellerPrice: Decimal
  totalCommission: Decimal
  product: { id: string; name: string } | null
  variant: { id: string; name: string; value: string } | null
}

export interface OrderShipment {
  id: string
  trackingCode: string | null
  status: string
  carrier: string | null
}

export interface OrderData {
  id: string
  orderNumber: string
  status: OrderStatusType
  subtotal: Decimal
  shippingFee: Decimal
  codAmount: Decimal
  commissionRate?: Decimal
  commissionAmount: Decimal
  grossMargin: Decimal
  netMargin: Decimal
  currency: string
  customerName: string
  customerPhone: string
  customerEmail?: string | null
  customerAddress: string
  customerCity: string
  customerPostalCode: string | null
  customerNotes: string | null
  createdAt: string
  acceptedAt: string | null
  shippedAt: string | null
  deliveredAt: string | null
  rejectedReason: string | null
  cancelledReason: string | null
  items: OrderItem[]
  supplier: { id: string; companyName: string } | null
  reseller: { id: string; companyName: string } | null
  shipments: OrderShipment[]
  commission?: { status: string; dueAt: string | null; paidAt: string | null } | null
  codCollection?: {
    status: string
    expectedAmount: Decimal
    collectedAmount: Decimal | null
  } | null
  deliveryCity?: { id: string; name: string } | null
  statusHistory?: OrderStatusHistory[]
}

export interface OrderStatusHistory {
  id: string
  fromStatus: OrderStatusType | null
  toStatus: OrderStatusType
  actorRole: string
  notes: string | null
  createdAt: string
}

/**
 * Le revendeur ne peut annuler que tant que le colis n'est pas pris en charge
 * par le transporteur (§5.3) : au-delà, l'annulation relève de l'administrateur.
 */
export const CANCELLABLE_STATUSES: OrderStatusType[] = [
  'PENDING',
  'ACCEPTED',
  'IN_PRODUCTION',
  'READY_TO_SHIP',
]

export function canResellerCancel(status: string): boolean {
  return (CANCELLABLE_STATUSES as string[]).includes(status)
}
