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
  Input,
  Label,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { ShipmentStatusBadge, OrderStatusBadge } from '@/components/status-badge'
import { formatCurrency, formatDate } from '@/lib/utils/helpers'
import {
  Search,
  Plus,
  Loader2,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  Truck,
  Info,
  ExternalLink,
  Printer,
} from 'lucide-react'

type ShipmentStatus =
  | 'CREATED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'
  | 'RETURNED'
  | 'ERROR'

interface Shipment {
  id: string
  trackingCode: string | null
  labelUrl: string | null
  status: ShipmentStatus
  carrier: string
  pieces: number
  weight: string | number | null
  codAmount: string | number | null
  isManual: boolean
  errorMessage: string | null
  createdAt: string
  pickedUpAt: string | null
  deliveredAt: string | null
  lastTrackingAt: string | null
  order: {
    id: string
    orderNumber: string
    status: string
    customerName: string
    customerCity: string | null
    codAmount: string | number
    currency: string
    supplier: { id: string; companyName: string } | null
    reseller: { id: string; companyName: string } | null
  }
}

interface ShipmentsResponse {
  shipments: Shipment[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

interface ReadyOrder {
  id: string
  orderNumber: string
  customerName: string
  customerCity: string | null
  codAmount: string | number
  currency: string
  shipments: { id: string; trackingCode: string | null; status: string }[]
}

const STATUS_LABELS: Record<ShipmentStatus, string> = {
  CREATED: 'Créée',
  PICKED_UP: 'Collectée',
  IN_TRANSIT: 'En transit',
  OUT_FOR_DELIVERY: 'En cours de livraison',
  DELIVERED: 'Livrée',
  DELIVERY_FAILED: 'Échec de livraison',
  RETURNED: 'Retournée',
  ERROR: 'Erreur',
}

export default function SupplierShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(
    null
  )

  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)

  // Création d'expédition
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [readyOrders, setReadyOrders] = useState<ReadyOrder[]>([])
  const [readyLoading, setReadyLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creatingOrderId, setCreatingOrderId] = useState<string | null>(null)
  const [weightDraft, setWeightDraft] = useState<Record<string, string>>({})

  const fetchShipments = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '15' })
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const response = await fetch(`/api/shipments?${params.toString()}`, { signal })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Erreur lors du chargement des expéditions")
      }

      const data: ShipmentsResponse = await response.json()
      setShipments(data.shipments || [])
      setTotal(data.pagination?.total ?? 0)
      setTotalPages(data.pagination?.totalPages ?? 0)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => {
    const controller = new AbortController()
    fetchShipments(controller.signal)
    return () => controller.abort()
  }, [fetchShipments])

  useEffect(() => {
    const timer = setTimeout(() => setPage(1), 300)
    return () => clearTimeout(timer)
  }, [search, statusFilter])

  const fetchReadyOrders = useCallback(async (signal?: AbortSignal) => {
    setReadyLoading(true)
    setCreateError(null)
    try {
      const response = await fetch('/api/orders?status=READY_TO_SHIP&limit=50', { signal })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur lors du chargement des commandes')
      }
      const data: { orders: ReadyOrder[] } = await response.json()
      setReadyOrders(data.orders || [])
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setCreateError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      if (!signal?.aborted) setReadyLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isCreateOpen) return
    const controller = new AbortController()
    fetchReadyOrders(controller.signal)
    return () => controller.abort()
  }, [isCreateOpen, fetchReadyOrders])

  async function handleCopy(shipment: Shipment) {
    if (!shipment.trackingCode) return
    try {
      await navigator.clipboard.writeText(shipment.trackingCode)
      setCopiedId(shipment.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setNotice({
        type: 'error',
        message: "Copie impossible depuis ce navigateur : sélectionnez le Code Suivi manuellement.",
      })
    }
  }

  async function handleRefresh(shipment: Shipment) {
    setRefreshingId(shipment.id)
    setNotice(null)
    setError(null)
    try {
      const response = await fetch(`/api/shipments/${shipment.id}`, { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de l'actualisation du suivi")
      }
      if (data.skipped) {
        setNotice({ type: 'info', message: data.skipped })
      } else {
        setNotice({
          type: 'success',
          message: `Suivi actualisé : expédition ${STATUS_LABELS[data.status as ShipmentStatus] ?? data.status}.`,
        })
      }
      await fetchShipments()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'actualisation du suivi")
    } finally {
      setRefreshingId(null)
    }
  }

  async function handleCreateShipment(order: ReadyOrder) {
    setCreatingOrderId(order.id)
    setCreateError(null)
    try {
      const weightValue = Number(weightDraft[order.id])
      const response = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          weight: Number.isFinite(weightValue) && weightValue > 0 ? weightValue : undefined,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de la création de l'expédition")
      }
      setNotice({
        type: 'success',
        message: data.reused
          ? `Une expédition existait déjà pour ${data.orderNumber} : Code Suivi ${data.shipment?.trackingCode ?? '—'}.`
          : `Expédition créée pour ${data.orderNumber} : Code Suivi ${data.shipment?.trackingCode ?? '—'}.`,
      })
      setIsCreateOpen(false)
      await fetchShipments()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Erreur lors de la création de l'expédition")
    } finally {
      setCreatingOrderId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expéditions</h1>
          <p className="text-gray-500">
            {loading ? 'Chargement...' : `${total} expédition${total > 1 ? 's' : ''}`}
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Créer l&apos;expédition
        </Button>
      </div>

      {/* Repli manuel : le Code Suivi reste le canal de référence */}
      <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-blue-900">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p className="text-sm">
          Si aucune notification automatique n&apos;est configurée, le Code Suivi reste
          affiché dans le tableau ci-dessous : utilisez le bouton « copier » pour le
          transmettre manuellement à votre transporteur ou au revendeur.
        </p>
      </div>

      {/* Filtres */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par Code Suivi, commande ou client..."
            className="pl-10"
            aria-label="Rechercher une expédition"
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
            {(Object.keys(STATUS_LABELS) as ShipmentStatus[]).map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {notice && (
        <div
          className={
            notice.type === 'error'
              ? 'flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800'
              : notice.type === 'info'
                ? 'flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-blue-900'
                : 'flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 p-3 text-green-800'
          }
        >
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="text-sm">{notice.message}</span>
        </div>
      )}

      {/* Tableau */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="relative w-full overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : shipments.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Truck className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">Aucune expédition</h3>
              <p className="text-gray-500 mt-1">
                Créez l&apos;expédition d&apos;une commande prête à expédier pour obtenir
                son Code Suivi AMEEX.
              </p>
              <Button className="mt-4" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Créer l&apos;expédition
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code Suivi</TableHead>
                  <TableHead className="hidden md:table-cell">Transporteur</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Commande</TableHead>
                  <TableHead className="hidden lg:table-cell">Client</TableHead>
                  <TableHead className="hidden xl:table-cell text-right">Poids</TableHead>
                  <TableHead className="text-right">COD</TableHead>
                  <TableHead className="hidden lg:table-cell">Dates</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.map((shipment) => (
                  <TableRow key={shipment.id}>
                    <TableCell>
                      {shipment.trackingCode ? (
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-900">
                            {shipment.trackingCode}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleCopy(shipment)}
                            title="Copier le Code Suivi"
                            aria-label="Copier le Code Suivi"
                          >
                            {copiedId === shipment.id ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Non attribué</span>
                      )}
                      {shipment.isManual && (
                        <p className="text-[11px] text-gray-500 mt-1">Saisie manuelle</p>
                      )}
                      {shipment.errorMessage && (
                        <p className="text-[11px] text-red-600 mt-1">
                          {shipment.errorMessage}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-gray-600">
                      {shipment.carrier}
                    </TableCell>
                    <TableCell>
                      <ShipmentStatusBadge status={shipment.status} />
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-gray-900">
                        {shipment.order.orderNumber}
                      </p>
                      <OrderStatusBadge status={shipment.order.status} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <p className="font-medium text-gray-900">
                        {shipment.order.customerName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {shipment.order.reseller?.companyName || '—'}
                      </p>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-right text-gray-600">
                      {shipment.weight !== null ? `${Number(shipment.weight)} kg` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(
                        Number(shipment.codAmount ?? shipment.order.codAmount),
                        shipment.order.currency
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-gray-600">
                      <p>Créée : {formatDate(shipment.createdAt)}</p>
                      {shipment.pickedUpAt && (
                        <p>Collectée : {formatDate(shipment.pickedUpAt)}</p>
                      )}
                      {shipment.deliveredAt && (
                        <p>Livrée : {formatDate(shipment.deliveredAt)}</p>
                      )}
                      {shipment.lastTrackingAt && (
                        <p className="text-gray-400">
                          Suivi : {formatDate(shipment.lastTrackingAt)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRefresh(shipment)}
                          disabled={refreshingId === shipment.id}
                        >
                          {refreshingId === shipment.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                          )}
                          Actualiser le suivi
                        </Button>
                        {shipment.labelUrl && (
                          <a href={shipment.labelUrl} target="_blank" rel="noreferrer">
                            <Button variant="outline" size="icon" title="Ouvrir l'étiquette">
                              <Printer className="h-4 w-4" />
                            </Button>
                          </a>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableCaption>
                {shipments.length} résultat(s) sur cette page
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

      {/* Création d'expédition */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Créer l&apos;expédition</DialogTitle>
            <DialogDescription>
              Sélectionnez une commande prête à expédier. Le Code Suivi est généré par
              AMEEX à partir du compte central de la plateforme.
            </DialogDescription>
          </DialogHeader>

          {createError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="text-sm">{createError}</span>
            </div>
          )}

          <div className="max-h-[50vh] overflow-auto">
            {readyLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : readyOrders.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                Aucune commande en attente d&apos;expédition.
              </p>
            ) : (
              <ul className="space-y-2">
                {readyOrders.map((order) => (
                  <li
                    key={order.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-gray-200 p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{order.orderNumber}</p>
                      <p className="text-xs text-gray-500">
                        {order.customerName}
                        {order.customerCity ? ` · ${order.customerCity}` : ''} ·{' '}
                        {formatCurrency(Number(order.codAmount), order.currency)}
                      </p>
                    </div>
                    <div className="w-full sm:w-32">
                      <Label htmlFor={`weight-${order.id}`} className="text-xs mb-1">
                        Poids (kg)
                      </Label>
                      <Input
                        id={`weight-${order.id}`}
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="auto"
                        value={weightDraft[order.id] ?? ''}
                        onChange={(e) =>
                          setWeightDraft((prev) => ({ ...prev, [order.id]: e.target.value }))
                        }
                      />
                    </div>
                    <Button
                      onClick={() => handleCreateShipment(order)}
                      loading={creatingOrderId === order.id}
                      className="sm:w-auto"
                    >
                      {creatingOrderId !== order.id && (
                        <Truck className="h-4 w-4 mr-2" />
                      )}
                      Créer
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info-bulle contextuelle : rappel du périmètre fournisseur */}
      <Card className="border-dashed">
        <CardContent className="py-4 text-sm text-gray-500 flex items-start gap-2">
          <ExternalLink className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Les expéditions affichées sont celles rattachées à vos commandes. Le suivi
            est rafraîchi automatiquement par la plateforme, et à la demande via le
            bouton « Actualiser le suivi ».
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
