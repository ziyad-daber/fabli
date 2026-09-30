import {
  canSystemTransition,
  canTransition,
  ORDER_STATUS_LABELS,
  SUPPLIER_ALLOWED,
  VALID_TRANSITIONS,
  statusTimestampField,
  type OrderStatusType,
} from '@/lib/orders/status'

/**
 * Matrice de transitions du cahier des charges §5.5 :
 *   En attente → Acceptée → En fabrication → Prête à expédier
 *              → Expédition créée → En transit → Livrée
 */
describe('matrice de transitions §5.5', () => {
  it('suit le chemin nominal de bout en bout', () => {
    const nominal: OrderStatusType[] = [
      'PENDING',
      'ACCEPTED',
      'IN_PRODUCTION',
      'READY_TO_SHIP',
      'SHIPMENT_CREATED',
      'IN_TRANSIT',
      'DELIVERED',
    ]

    for (let i = 0; i < nominal.length - 1; i++) {
      expect(canTransition(nominal[i], nominal[i + 1])).toBe(true)
    }
  })

  it('refuse de sauter une étape de production', () => {
    expect(canTransition('PENDING', 'IN_PRODUCTION')).toBe(false)
    expect(canTransition('ACCEPTED', 'READY_TO_SHIP')).toBe(false)
    expect(canTransition('READY_TO_SHIP', 'DELIVERED')).toBe(false)
  })

  it('permet le refus et l\'annulation tant que la commande est en préparation', () => {
    expect(canTransition('PENDING', 'REJECTED')).toBe(true)
    expect(canTransition('PENDING', 'CANCELLED')).toBe(true)
    expect(canTransition('ACCEPTED', 'REJECTED')).toBe(true)
    expect(canTransition('IN_PRODUCTION', 'CANCELLED')).toBe(true)
  })

  it('ne laisse rien repartir après un refus ou une annulation', () => {
    expect(VALID_TRANSITIONS.REJECTED).toEqual([])
    expect(VALID_TRANSITIONS.CANCELLED).toEqual([])
    expect(canTransition('REJECTED', 'ACCEPTED')).toBe(false)
    expect(canTransition('CANCELLED', 'ACCEPTED')).toBe(false)
  })

  it('gère les statuts de livraison', () => {
    expect(canTransition('IN_TRANSIT', 'DELIVERY_FAILED')).toBe(true)
    expect(canTransition('IN_TRANSIT', 'RETURNED')).toBe(true)
    expect(canTransition('DELIVERY_FAILED', 'IN_TRANSIT')).toBe(true)
    expect(canTransition('DELIVERED', 'RETURNED')).toBe(true)
  })

  it('permet de retenter une expédition en erreur', () => {
    expect(canTransition('SHIPMENT_ERROR', 'READY_TO_SHIP')).toBe(true)
    expect(canTransition('SHIPMENT_CREATED', 'SHIPMENT_ERROR')).toBe(true)
  })

  it('couvre tous les statuts de l\'énumération', () => {
    const allStatuses: OrderStatusType[] = [
      'PENDING',
      'ACCEPTED',
      'IN_PRODUCTION',
      'READY_TO_SHIP',
      'SHIPMENT_CREATED',
      'IN_TRANSIT',
      'DELIVERED',
      'REJECTED',
      'CANCELLED',
      'DELIVERY_FAILED',
      'RETURNED',
      'SHIPMENT_ERROR',
    ]

    for (const status of allStatuses) {
      expect(VALID_TRANSITIONS[status]).toBeDefined()
      expect(ORDER_STATUS_LABELS[status]).toBeTruthy()
    }
  })

  it('horodate les étapes qui ont une colonne dédiée', () => {
    expect(statusTimestampField('ACCEPTED')).toBe('acceptedAt')
    expect(statusTimestampField('IN_PRODUCTION')).toBe('producedAt')
    expect(statusTimestampField('READY_TO_SHIP')).toBe('readyToShipAt')
    expect(statusTimestampField('SHIPMENT_CREATED')).toBe('shippedAt')
    expect(statusTimestampField('DELIVERED')).toBe('deliveredAt')

    // Refus, annulation et incidents n'ont pas de colonne dédiée : leur date
    // reste dans OrderStatusHistory, qui est horodatée et attribuée.
    for (const status of ['PENDING', 'REJECTED', 'CANCELLED', 'DELIVERY_FAILED', 'RETURNED', 'SHIPMENT_ERROR']) {
      expect(statusTimestampField(status as OrderStatusType)).toBeNull()
    }
  })
})

describe('transitions système (webhook transporteur)', () => {
  it('laisse le transporteur piloter les statuts de livraison', () => {
    expect(canSystemTransition('SHIPMENT_CREATED', 'IN_TRANSIT')).toBe(true)
    expect(canSystemTransition('IN_TRANSIT', 'DELIVERED')).toBe(true)
    expect(canSystemTransition('IN_TRANSIT', 'DELIVERY_FAILED')).toBe(true)
  })

  it('interdit au transporteur de toucher aux étapes commerciales', () => {
    expect(canSystemTransition('READY_TO_SHIP', 'ACCEPTED')).toBe(false)
    expect(canSystemTransition('ACCEPTED', 'IN_PRODUCTION')).toBe(false)
    expect(canSystemTransition('PENDING', 'ACCEPTED')).toBe(false)
  })
})

describe('permissions fournisseur', () => {
  it('laisse le fournisseur accepter, produire, préparer, refuser et annuler', () => {
    expect(SUPPLIER_ALLOWED).toEqual(
      expect.arrayContaining(['ACCEPTED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'REJECTED', 'CANCELLED'])
    )
  })

  it('interdit au fournisseur de gérer l\'expédition et la livraison', () => {
    expect(SUPPLIER_ALLOWED).not.toContain('SHIPMENT_CREATED')
    expect(SUPPLIER_ALLOWED).not.toContain('IN_TRANSIT')
    expect(SUPPLIER_ALLOWED).not.toContain('DELIVERED')
  })
})