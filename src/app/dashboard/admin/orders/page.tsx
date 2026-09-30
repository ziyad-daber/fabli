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
import { Search, Loader2, AlertTriangle, ShoppingBag, X, Eye } from 'lucide-react'
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
  unitResellerPrice: string | number
  totalResellerPrice: string | number
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
  commissionAmount: string | number
  commissionRate: string | number
  currency: string
  customerName: string
  customerPhone: string
  customerEmail: string | null
  customerAddress: string
  customerCity: string
  customerPostalCode: string | null
  customerNotes: string | null
  createdAt: string
  supplier: { id: string; companyName: string } | null
  reseller: { id: string; companyName: string } | null
  items: OrderItem[]
}

interface SupplierOption {
  id: string
  companyName: string
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

/** Statuses an administrator may set manually from this screen. */
const ADMIN_TRANSITIONS: Record<string, OrderStatus[]> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['IN_PRODUCTION', 'REJECTED', 'CANCELLED'],
  IN_PRODUCTION: ['READY_TO_SHIP', 'CANCELLED'],
  READY_TO_SHIP: ['SHIPMENT_CREATED', 'CANCELLED'],
  SHIPMENT_CREATED: ['IN_TRANSIT', 'CANCELLED', 'SHIPMENT_ERROR'],
  IN_TRANSIT: ['DELIVERED', 'DELIVERY_FAILED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  DELIVERY_FAILED: ['RETURNED', 'IN_TRANSIT'],
  SHIPMENT_ERROR: ['READY_TO_SHIP', 'CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
  RETURNED: [],
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('fr-MA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderData[]>([])
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [resellers, setResellers] = useState<SupplierOption[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [resellerFilter, setResellerFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>('')
  const [statusNotes, setStatusNotes] = useState('')
  const [updating, setUpdating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '15' })
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (supplierFilter !== 'all') params.set('supplierId', supplierFilter)
      if (resellerFilter !== 'all') params.set('resellerId', resellerFilter)

      const response = await fetch(`/api/admin/orders?${params.toString()}`)
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur lors du chargement des commandes')
      }

      const data = await response.json()
      setOrders(data.orders || [])
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, supplierFilter, resellerFilter])

  const fetchFilterOptions = useCallback(async () => {
    try {
      const [suppliersRes, resellersRes] = await Promise.all([
        fetch('/api/suppliers'),
        fetch('/api/resellers'),
      ])

      if (suppliersRes.ok) {
        const data = await suppliersRes.json()
        setSuppliers(data.suppliers || [])
      }

      if (resellersRes.ok) {
        const data = await resellersRes.json()
        setResellers(data.resellers || [])
      }
    } catch (err) {
      console.error('Failed to load filter options:', err)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  useEffect(() => {
    fetchFilterOptions()
  }, [fetchFilterOptions])

  function openDetailsModal(order: OrderData) {
    setSelectedOrder(order)
    setNextStatus('')
    setStatusNotes('')
    setFormError(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setSelectedOrder(null)
    setFormError(null)
  }

  async function handleStatusUpdate() {
    if (!selectedOrder || !nextStatus) return

    setUpdating(true)
    setFormError(null)
    try {
      const response = await fetch(`/api/orders/${selectedOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, notes: statusNotes || undefined }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la mise à jour du statut')
      }

      await fetchOrders()
      closeModal()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour')
    } finally {
      setUpdating(false)
    }
  }

  const availableTransitions = selectedOrder
    ? ADMIN_TRANSITIONS[selectedOrder.status] || []
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gestion des commandes</h1>
        <p className="text-gray-500">
          {total} commande{total > 1 ? 's' : ''} sur la plateforme
        </p>
      </div>

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Rechercher par numéro, client, téléphone..."
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

        <Select
          value={supplierFilter}
          onValueChange={(value) => {
            setSupplierFilter(value)
            setPage(1)
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Tous les fournisseurs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les fournisseurs</SelectItem>
            {suppliers.map((supplier) => (
              <SelectItem key={supplier.id} value={supplier.id}>
                {supplier.companyName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={resellerFilter}
          onValueChange={(value) => {
            setResellerFilter(value)
            setPage(1)
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Tous les revendeurs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les revendeurs</SelectItem>
            {resellers.map((reseller) => (
              <SelectItem key={reseller.id} value={reseller.id}>
                {reseller.companyName}
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
                  <TableHead>Client</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="px-6 py-4 text-center text-gray-500">
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
                        <p className="font-medium text-gray-900">{order.customerName}</p>
                        <p className="text-xs text-gray-500">{order.customerCity}</p>
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {order.supplier?.companyName || '—'}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-gray-900">
                          {formatCurrency(
                            Number(order.subtotal) + Number(order.shippingFee),
                            order.currency
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          COD {formatCurrency(Number(order.codAmount), order.currency)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLES[order.status]}>
                          {STATUS_LABELS[order.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-600">{formatDate(order.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDetailsModal(order)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Détails
                        </Button>
                      </TableCell>
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

      {/* Order details modal */}
      {isModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedOrder.orderNumber}</h2>
                <Badge className={`mt-1 ${STATUS_STYLES[selectedOrder.status]}`}>
                  {STATUS_LABELS[selectedOrder.status]}
                </Badge>
              </div>
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

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-900">Client</h3>
                <p className="text-sm text-gray-700">{selectedOrder.customerName}</p>
                <p className="text-sm text-gray-600">{selectedOrder.customerPhone}</p>
                {selectedOrder.customerEmail && (
                  <p className="text-sm text-gray-600">{selectedOrder.customerEmail}</p>
                )}
                <p className="text-sm text-gray-600">{selectedOrder.customerAddress}</p>
                <p className="text-sm text-gray-600">
                  {selectedOrder.customerCity} {selectedOrder.customerPostalCode || ''}
                </p>
                {selectedOrder.customerNotes && (
                  <p className="text-sm text-gray-500 italic mt-2">
                    Note : {selectedOrder.customerNotes}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-gray-900">Parties</h3>
                <p className="text-sm text-gray-600">
                  Fournisseur : {selectedOrder.supplier?.companyName || '—'}
                </p>
                <p className="text-sm text-gray-600">
                  Revendeur : {selectedOrder.reseller?.companyName || '—'}
                </p>
                <p className="text-sm text-gray-600">Créée le {formatDate(selectedOrder.createdAt)}</p>
              </div>
            </div>

            {/* Items */}
            <div className="mt-6">
              <h3 className="font-semibold text-gray-900 mb-2">
                Articles ({selectedOrder.items.length})
              </h3>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produit</TableHead>
                      <TableHead>Quantité</TableHead>
                      <TableHead className="text-right">Prix unitaire</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="font-medium text-gray-900">
                            {item.product?.name || 'Produit supprimé'}
                          </p>
                          {item.variant && (
                            <p className="text-xs text-gray-500">
                              {item.variant.name}: {item.variant.value}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(Number(item.unitResellerPrice), selectedOrder.currency)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(Number(item.totalResellerPrice), selectedOrder.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Totals */}
            <div className="mt-4 flex justify-end">
              <dl className="w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">Sous-total</dt>
                  <dd>
                    {formatCurrency(Number(selectedOrder.subtotal), selectedOrder.currency)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">Livraison</dt>
                  <dd>
                    {formatCurrency(Number(selectedOrder.shippingFee), selectedOrder.currency)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">Commission plateforme</dt>
                  <dd>
                    {formatCurrency(
                      Number(selectedOrder.commissionAmount),
                      selectedOrder.currency
                    )}
                  </dd>
                </div>
                <div className="flex justify-between font-semibold border-t pt-1">
                  <dt>Montant COD</dt>
                  <dd>
                    {formatCurrency(Number(selectedOrder.codAmount), selectedOrder.currency)}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Status update */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-3">Modifier le statut</h3>

              {availableTransitions.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Aucun changement de statut possible depuis «{' '}
                  {STATUS_LABELS[selectedOrder.status]} ».
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="nextStatus">Nouveau statut</Label>
                    <Select
                      value={nextStatus}
                      onValueChange={(value) => setNextStatus(value as OrderStatus)}
                    >
                      <SelectTrigger id="nextStatus">
                        <SelectValue placeholder="Sélectionner un statut" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTransitions.map((status) => (
                          <SelectItem key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="statusNotes">Notes internes</Label>
                    <Textarea
                      id="statusNotes"
                      value={statusNotes}
                      onChange={(e) => setStatusNotes(e.target.value)}
                      placeholder="Motif de la modification..."
                      rows={2}
                    />
                  </div>

                  <div className="sm:col-span-2 flex justify-end">
                    <Button onClick={handleStatusUpdate} disabled={updating || !nextStatus}>
                      {updating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Mise à jour...
                        </>
                      ) : (
                        <>
                          <ShoppingBag className="h-4 w-4 mr-2" />
                          Mettre à jour
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
