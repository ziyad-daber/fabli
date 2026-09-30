'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Pagination,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui'
import { Search, Loader2, AlertTriangle, Plus, Ban, Copy, Check } from 'lucide-react'
import { OrderStatusBadge, ORDER_STATUS_LABELS } from '@/components/status-badge'
import { formatCurrency, formatDate } from '@/lib/utils/helpers'
import { CartProvider } from '@/components/reseller/cart-context'
import {
  canResellerCancel,
  type OrderData,
  type OrderStatusType,
} from '@/components/reseller/order-types'

const LIMIT = 15

const STATUS_OPTIONS: OrderStatusType[] = [
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

function OrdersContent() {
  const router = useRouter()

  const [orders, setOrders] = useState<OrderData[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [cancelling, setCancelling] = useState<OrderData | null>(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
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

  useEffect(() => {
    const timer = setTimeout(() => setPage(1), 0)
    return () => clearTimeout(timer)
  }, [search])

  async function handleCancel() {
    if (!cancelling) return

    setSubmitting(true)
    setDialogError(null)
    try {
      const response = await fetch(`/api/orders/${cancelling.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED', reason: reason.trim() || undefined }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'annulation')
      }

      setCancelling(null)
      setReason('')
      await fetchOrders()
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Erreur lors de l\'annulation')
    } finally {
      setSubmitting(false)
    }
  }

  async function copyTrackingCode(orderId: string, code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedId(orderId)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      setError('Impossible de copier le Code Suivi dans le presse-papier')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes commandes</h1>
          <p className="text-gray-500">{total} commande{total > 1 ? 's' : ''} au total</p>
        </div>
        <Link href="/dashboard/reseller/cart">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Créer une commande
          </Button>
        </Link>
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
            aria-label="Rechercher une commande"
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
            {STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {ORDER_STATUS_LABELS[status]}
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
                  <TableHead>Date</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Articles</TableHead>
                  <TableHead className="text-right">Total client (COD)</TableHead>
                  <TableHead className="text-right">Marge nette</TableHead>
                  <TableHead>Code Suivi</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="px-6 py-4 text-center text-gray-500">
                      Aucune commande trouvée
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((order) => {
                    const articleCount = order.items.reduce((sum, item) => sum + item.quantity, 0)
                    const shipment = order.shipments?.[0]
                    const trackingCode = shipment?.trackingCode ?? null

                    return (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => router.push(`/dashboard/reseller/orders/${order.id}`)}
                      >
                        <TableCell className="font-medium text-gray-900">
                          {order.orderNumber}
                        </TableCell>
                        <TableCell className="text-gray-600">{formatDate(order.createdAt)}</TableCell>
                        <TableCell className="text-gray-600">
                          {order.supplier?.companyName ?? '—'}
                        </TableCell>
                        <TableCell>
                          <OrderStatusBadge status={order.status} />
                        </TableCell>
                        <TableCell className="text-right text-gray-600">{articleCount}</TableCell>
                        <TableCell className="text-right font-medium text-gray-900">
                          {formatCurrency(Number(order.codAmount), order.currency)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            Number(order.netMargin) < 0 ? 'text-red-600' : 'text-green-600'
                          }`}
                        >
                          {formatCurrency(Number(order.netMargin), order.currency)}
                        </TableCell>
                        <TableCell>
                          {trackingCode ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="font-mono text-xs">{trackingCode}</span>
                              <button
                                type="button"
                                aria-label={`Copier le Code Suivi ${trackingCode}`}
                                className="text-gray-400 hover:text-gray-700"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  copyTrackingCode(order.id, trackingCode)
                                }}
                              >
                                {copiedId === order.id ? (
                                  <Check className="h-3.5 w-3.5 text-green-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                          {canResellerCancel(order.status) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setCancelling(order)
                                setReason('')
                                setDialogError(null)
                              }}
                            >
                              <Ban className="h-4 w-4 mr-2" />
                              Annuler
                            </Button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
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

      {/* Annulation */}
      <Dialog open={!!cancelling} onOpenChange={(open) => !open && setCancelling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler la commande</DialogTitle>
            <DialogDescription>
              Vous êtes sur le point d\'annuler la commande {cancelling?.orderNumber}. Cette action est
              définitive.
            </DialogDescription>
          </DialogHeader>

          {dialogError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm">{dialogError}</span>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="cancelReason">Motif (facultatif)</Label>
            <Textarea
              id="cancelReason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex. : le client a changé d'avis"
              maxLength={500}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)} disabled={submitting}>
              Fermer
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Annulation...
                </>
              ) : (
                'Confirmer l\'annulation'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function ResellerOrdersPage() {
  return (
    <CartProvider>
      <OrdersContent />
    </CartProvider>
  )
}
