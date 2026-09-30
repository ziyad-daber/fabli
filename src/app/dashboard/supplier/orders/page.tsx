'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
  TableCaption,
  Button,
  Badge,
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Pagination,
  PaginationList,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui'
import { ShipmentStatusBadge } from '@/components/status-badge'
import {
  Search,
  Loader2,
  AlertTriangle,
  Package,
  X,
  CheckCircle,
  XCircle,
  Factory,
  PackageCheck,
  Truck,
  Copy,
  Check,
  Info,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils/helpers'

type OrderStatus =
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

interface OrderItem {
  id: string
  quantity: number
  unitSupplierPrice: string | number
  totalSupplierPrice: string | number
  product: { id: string; name: string; slug: string } | null
  variant: { id: string; name: string; value: string } | null
}

interface OrderData {
  id: string
  orderNumber: string
  status: OrderStatus
  subtotal: string | number
  shippingFee: string | number
  codAmount: string | number
  commissionRate: string | number
  commissionAmount: string | number
  currency: string
  customerName: string
  customerPhone: string
  customerAddress: string
  customerCity: string
  customerPostalCode: string | null
  customerNotes: string | null
  createdAt: string
  reseller: { id: string; companyName: string } | null
  items: OrderItem[]
  shipments?: {
    id: string
    trackingCode: string | null
    status: string
    carrier: string
  }[]
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'En attente',
  ACCEPTED: 'Acceptée',
  IN_PRODUCTION: 'En production',
  READY_TO_SHIP: 'Prête à expédier',
  SHIPMENT_CREATED: 'Expédition créée',
  IN_TRANSIT: 'En transit',
  DELIVERED: 'Livrée',
  REJECTED: 'Rejetée',
  CANCELLED: 'Annulée',
  DELIVERY_FAILED: 'Échec de livraison',
  RETURNED: 'Retournée',
  SHIPMENT_ERROR: 'Erreur d\'expédition',
}

const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  ACCEPTED: 'bg-blue-100 text-blue-800',
  IN_PRODUCTION: 'bg-indigo-100 text-indigo-800',
  READY_TO_SHIP: 'bg-cyan-100 text-cyan-800',
  SHIPMENT_CREATED: 'bg-purple-100 text-purple-800',
  IN_TRANSIT: 'bg-orange-100 text-orange-800',
  DELIVERED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-200 text-gray-800',
  DELIVERY_FAILED: 'bg-red-100 text-red-800',
  RETURNED: 'bg-gray-100 text-gray-800',
  SHIPMENT_ERROR: 'bg-red-200 text-red-900',
}

/** Actions a supplier is allowed to trigger, keyed by current status. */
const SUPPLIER_ACTIONS: Record<string, { status: OrderStatus; label: string; icon: typeof CheckCircle }[]> = {
  PENDING: [
    { status: 'ACCEPTED', label: 'Accepter', icon: CheckCircle },
    { status: 'REJECTED', label: 'Refuser', icon: XCircle },
  ],
  ACCEPTED: [{ status: 'IN_PRODUCTION', label: 'Démarrer la production', icon: Factory }],
  IN_PRODUCTION: [{ status: 'READY_TO_SHIP', label: 'Marquer prête à expédier', icon: PackageCheck }],
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('fr-MA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function SupplierOrdersPage() {
  const [orders, setOrders] = useState<OrderData[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [actionData, setActionData] = useState<{
    action?: OrderStatus
    notes?: string
  }>({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Création d'expédition depuis une commande prête à expédier
  const [creatingShipmentId, setCreatingShipmentId] = useState<string | null>(null)
  const [shipmentNotice, setShipmentNotice] = useState<string | null>(null)
  const [shipmentError, setShipmentError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '15' })
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const response = await fetch(`/api/orders?${params.toString()}`)
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur lors du chargement des commandes')
      }

      const data = await response.json()
      setOrders(data.orders || [])
      setTotal(data.pagination?.total || 0)
      setTotalPages(data.pagination?.totalPages || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  function openActionModal(order: OrderData, action?: OrderStatus) {
    setSelectedOrder(order)
    setActionData({ action, notes: '' })
    setFormError(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setSelectedOrder(null)
    setActionData({})
    setFormError(null)
  }

  async function handleAction() {
    if (!selectedOrder || !actionData.action) return

    setSubmitting(true)
    setFormError(null)
    try {
      const response = await fetch(`/api/orders/${selectedOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: actionData.action,
          notes: actionData.notes || undefined,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la mise à jour')
      }

      await fetchOrders()
      closeModal()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour')
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * La commande passe à SHIPMENT_CREATED par la création d'expédition elle-même :
   * le serveur refuse `SHIPMENT_CREATED` sur PATCH /api/orders/[id].
   */
  async function handleCreateShipment(order: OrderData) {
    setCreatingShipmentId(order.id)
    setShipmentError(null)
    setShipmentNotice(null)
    try {
      const response = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de la création de l'expédition")
      }
      setShipmentNotice(
        data.reused
          ? `Une expédition existait déjà pour ${data.orderNumber} (Code Suivi ${data.shipment?.trackingCode ?? '—'}).`
          : `Expédition créée pour ${data.orderNumber} : Code Suivi ${data.shipment?.trackingCode ?? '—'}.`
      )
      await fetchOrders()
    } catch (err) {
      setShipmentError(
        err instanceof Error ? err.message : "Erreur lors de la création de l'expédition"
      )
    } finally {
      setCreatingShipmentId(null)
    }
  }

  async function handleCopyTrackingCode(orderId: string, trackingCode: string) {
    try {
      await navigator.clipboard.writeText(trackingCode)
      setCopiedId(orderId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setShipmentError(
        'Copie impossible depuis ce navigateur : sélectionnez le Code Suivi manuellement.'
      )
    }
  }

  function renderActionButtons(order: OrderData) {
    // Une commande prête à expédier passe par la création d'expédition, pas par
    // une transition de statut.
    if (order.status === 'READY_TO_SHIP') {
      const isCreating = creatingShipmentId === order.id
      return (
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => handleCreateShipment(order)} disabled={isCreating}>
            {isCreating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Truck className="h-4 w-4 mr-2" />
            )}
            Créer l&apos;expédition
          </Button>
        </div>
      )
    }

    const actions = SUPPLIER_ACTIONS[order.status] || []

    if (actions.length === 0) {
      return <span className="text-xs text-gray-400">—</span>
    }

    return (
      <div className="flex flex-wrap justify-end gap-2">
        {actions.map((action) => {
          const Icon = action.icon
          const isDestructive = action.status === 'REJECTED'
          return (
            <Button
              key={action.status}
              variant={isDestructive ? 'outline' : 'default'}
              size="sm"
              onClick={() => openActionModal(order, action.status)}
            >
              <Icon className="h-4 w-4 mr-2" />
              {action.label}
            </Button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Commandes</h1>
        <p className="text-gray-500">
          {total} commande{total > 1 ? 's' : ''} à traiter
        </p>
      </div>

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par numéro de commande ou client..."
            className="pl-10"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value)
            setPage(1)
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {shipmentError && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="text-sm">{shipmentError}</span>
        </div>
      )}

      {shipmentNotice && (
        <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 p-3 text-green-800">
          <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="text-sm">{shipmentNotice}</span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="relative w-full overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° commande</TableHead>
                  <TableHead>Revendeur</TableHead>
                  <TableHead>Articles</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden lg:table-cell">Code Suivi</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="px-6 py-4 text-center text-gray-500">
                      Aucune commande trouvée
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium text-gray-900">
                        {order.orderNumber}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-gray-900">
                          {order.reseller?.companyName || 'Client'}
                        </p>
                        <p className="text-xs text-gray-500">{order.customerName}</p>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {order.items.slice(0, 3).map((item, index) => (
                            <p key={item.id} className="text-xs text-gray-700">
                              {index + 1}. {item.quantity}× {item.product?.name || 'Produit'}
                            </p>
                          ))}
                          {order.items.length > 3 && (
                            <p className="text-xs text-gray-500 italic">
                              et {order.items.length - 3} autres articles
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <p className="font-medium text-gray-900">
                          {formatCurrency(
                            Number(order.subtotal) + Number(order.shippingFee),
                            order.currency
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatCurrency(Number(order.subtotal), order.currency)} (articles) +{' '}
                          {formatCurrency(Number(order.shippingFee), order.currency)} (livraison)
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLES[order.status]}>
                          {STATUS_LABELS[order.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {order.shipments && order.shipments.length > 0 ? (
                          <div className="space-y-1">
                            {order.shipments.map((shipment) =>
                              shipment.trackingCode ? (
                                <div key={shipment.id} className="flex items-center gap-1.5">
                                  <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-900">
                                    {shipment.trackingCode}
                                  </code>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() =>
                                      handleCopyTrackingCode(order.id, shipment.trackingCode as string)
                                    }
                                    title="Copier le Code Suivi"
                                    aria-label="Copier le Code Suivi"
                                  >
                                    {copiedId === order.id ? (
                                      <Check className="h-3.5 w-3.5 text-green-600" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                  <ShipmentStatusBadge status={shipment.status} />
                                </div>
                              ) : (
                                <span key={shipment.id} className="text-xs text-gray-400">
                                  En attente de Code Suivi
                                </span>
                              )
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-gray-600">
                        {formatDate(order.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">{renderActionButtons(order)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              <TableCaption>
                {loading ? 'Chargement...' : `${orders.length} résultat(s) sur cette page`}
              </TableCaption>
            </Table>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination>
            <PaginationPrevious
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Précédent
            </PaginationPrevious>

            <PaginationList>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <PaginationLink
                  key={pageNum}
                  isActive={page === pageNum}
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum}
                </PaginationLink>
              ))}
            </PaginationList>

            <PaginationNext
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Suivant
            </PaginationNext>
          </Pagination>
        </div>
      )}

      {/* Action modal */}
      {isModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {actionData.action
                  ? STATUS_LABELS[actionData.action]
                  : 'Détails de la commande'}
              </h2>
              <Button variant="ghost" size="icon" onClick={closeModal} aria-label="Fermer">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {formError && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="text-sm">{formError}</span>
              </div>
            )}

            <div className="space-y-2 text-sm mb-4">
              <p className="font-medium text-gray-900">{selectedOrder.orderNumber}</p>
              <p className="text-gray-600">
                Client : {selectedOrder.customerName} · {selectedOrder.customerPhone}
              </p>
              <p className="text-gray-600">
                {selectedOrder.customerAddress}, {selectedOrder.customerCity}{' '}
                {selectedOrder.customerPostalCode || ''}
              </p>
              {selectedOrder.customerNotes && (
                <p className="text-gray-500 italic">Note : {selectedOrder.customerNotes}</p>
              )}
              {selectedOrder.shipments && selectedOrder.shipments.length > 0 && (
                <div className="mt-3 rounded-lg border border-gray-200 p-3">
                  <p className="font-medium text-gray-900 mb-2">Code Suivi</p>
                  <ul className="space-y-1">
                    {selectedOrder.shipments.map((shipment) => (
                      <li key={shipment.id} className="flex items-center gap-2">
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-900">
                          {shipment.trackingCode || 'Non attribué'}
                        </code>
                        <ShipmentStatusBadge status={shipment.status} />
                        <span className="text-xs text-gray-500">{shipment.carrier}</span>
                        {shipment.trackingCode && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() =>
                              handleCopyTrackingCode(
                                selectedOrder.id,
                                shipment.trackingCode as string
                              )
                            }
                            title="Copier le Code Suivi"
                            aria-label="Copier le Code Suivi"
                          >
                            {copiedId === selectedOrder.id ? (
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    Si aucune notification automatique n&apos;est configurée, ce Code
                    Suivi reste affiché et copiable pour être transmis manuellement.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 overflow-hidden mb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Article</TableHead>
                    <TableHead>Qté</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedOrder.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium text-gray-900">
                          {item.product?.name || 'Produit'}
                        </p>
                        {item.variant && (
                          <p className="text-xs text-gray-500">
                            {item.variant.name}: {item.variant.value}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(Number(item.totalSupplierPrice), selectedOrder.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {actionData.action && (
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={actionData.notes || ''}
                    onChange={(e) => setActionData((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Ajouter des notes sur cette action..."
                    rows={3}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={closeModal} disabled={submitting}>
                    Annuler
                  </Button>
                  <Button
                    onClick={handleAction}
                    disabled={submitting}
                    variant={actionData.action === 'REJECTED' ? 'destructive' : 'default'}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Traitement...
                      </>
                    ) : (
                      <>
                        <Package className="h-4 w-4 mr-2" />
                        Confirmer
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {!actionData.action && (
              <div className="flex justify-end">
                <Button variant="outline" onClick={closeModal}>
                  Fermer
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
