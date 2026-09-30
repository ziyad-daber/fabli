'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Button,
  Input,
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
  Pagination,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { Search, Loader2, AlertTriangle, Copy, Check, RefreshCw, BellOff } from 'lucide-react'
import { ShipmentStatusBadge, OrderStatusBadge } from '@/components/status-badge'
import { formatCurrency, formatDateTime } from '@/lib/utils/helpers'

interface ShipmentData {
  id: string
  trackingCode: string | null
  labelUrl: string | null
  status: string
  carrier: string | null
  pieces: number | null
  weight: number | null
  codAmount: number | string | null
  isManual: boolean
  createdAt: string
  pickedUpAt: string | null
  deliveredAt: string | null
  lastTrackingAt: string | null
  order: {
    id: string
    orderNumber: string
    status: string
    customerName: string
    customerCity: string
    codAmount: number | string
    currency: string
    supplier: { id: string; companyName: string } | null
    reseller: { id: string; companyName: string } | null
  }
}

const LIMIT = 15

const STATUS_OPTIONS = [
  { value: 'CREATED', label: 'Créée' },
  { value: 'PICKED_UP', label: 'Collectée' },
  { value: 'IN_TRANSIT', label: 'En transit' },
  { value: 'OUT_FOR_DELIVERY', label: 'En cours de livraison' },
  { value: 'DELIVERED', label: 'Livrée' },
  { value: 'DELIVERY_FAILED', label: 'Échec de livraison' },
  { value: 'RETURNED', label: 'Retournée' },
  { value: 'ERROR', label: 'Erreur' },
]

export default function ResellerShipmentsPage() {
  const [shipments, setShipments] = useState<ShipmentData[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchShipments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const response = await fetch(`/api/shipments?${params.toString()}`)
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur lors du chargement des expéditions')
      }

      const data = await response.json()
      setShipments(data.shipments || [])
      setTotal(data.pagination?.total || 0)
      setTotalPages(data.pagination?.totalPages || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => {
    fetchShipments()
  }, [fetchShipments])

  useEffect(() => {
    const timer = setTimeout(() => setPage(1), 0)
    return () => clearTimeout(timer)
  }, [search])

  async function handleRefresh(shipmentId: string) {
    setRefreshingId(shipmentId)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/shipments/${shipmentId}`, { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'actualisation du suivi')
      }
      setNotice(
        data.skipped
          ? `Suivi non actualisé : ${data.skipped}`
          : 'Suivi actualisé auprès du transporteur.'
      )
      await fetchShipments()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'actualisation du suivi')
    } finally {
      setRefreshingId(null)
    }
  }

  async function copyTrackingCode(id: string, code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      setError('Impossible de copier le Code Suivi dans le presse-papier')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Expéditions</h1>
        <p className="text-gray-500">{total} expédition{total > 1 ? 's' : ''} suivie{total > 1 ? 's' : ''}</p>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-800 text-sm">
        <BellOff className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          Aucun canal de notification n&apos;est configuré côté plateforme dans ce MVP : le Code
          Suivi reste affiché ci-dessous et peut être copié manuellement pour être transmis à votre
          client.
        </p>
      </div>

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par Code Suivi, n° de commande ou client..."
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
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
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

      {notice && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-green-800 text-sm">
          {notice}
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
                  <TableHead>Code Suivi</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Transporteur</TableHead>
                  <TableHead>Commande</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">COD</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="px-6 py-4 text-center text-gray-500">
                      Aucune expédition trouvée
                    </TableCell>
                  </TableRow>
                ) : (
                  shipments.map((shipment) => (
                    <TableRow key={shipment.id}>
                      <TableCell>
                        {shipment.trackingCode ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="font-mono text-xs font-medium text-gray-900">
                              {shipment.trackingCode}
                            </span>
                            <button
                              type="button"
                              aria-label={`Copier le Code Suivi ${shipment.trackingCode}`}
                              className="text-gray-400 hover:text-gray-700"
                              onClick={() => copyTrackingCode(shipment.id, shipment.trackingCode as string)}
                            >
                              {copiedId === shipment.id ? (
                                <Check className="h-3.5 w-3.5 text-green-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">Non attribué</span>
                        )}
                        {shipment.isManual && (
                          <Badge variant="secondary" className="ml-2">
                            Manuel
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <ShipmentStatusBadge status={shipment.status} />
                      </TableCell>
                      <TableCell className="text-gray-600">{shipment.carrier ?? '—'}</TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/reseller/orders/${shipment.order.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {shipment.order.orderNumber}
                        </Link>
                        <div className="mt-1">
                          <OrderStatusBadge status={shipment.order.status} />
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-600">
                        <p className="font-medium text-gray-900">{shipment.order.customerName}</p>
                        <p className="text-xs text-gray-500">{shipment.order.customerCity}</p>
                      </TableCell>
                      <TableCell className="text-right font-medium text-gray-900">
                        {formatCurrency(Number(shipment.order.codAmount), shipment.order.currency)}
                      </TableCell>
                      <TableCell className="text-xs text-gray-600">
                        <p>Créée : {formatDateTime(shipment.createdAt)}</p>
                        {shipment.pickedUpAt && (
                          <p>Collectée : {formatDateTime(shipment.pickedUpAt)}</p>
                        )}
                        {shipment.deliveredAt && (
                          <p className="text-green-700">Livrée : {formatDateTime(shipment.deliveredAt)}</p>
                        )}
                        {shipment.lastTrackingAt && (
                          <p className="text-gray-500">
                            Suivi : {formatDateTime(shipment.lastTrackingAt)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRefresh(shipment.id)}
                          disabled={refreshingId === shipment.id}
                        >
                          {refreshingId === shipment.id ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                          )}
                          Actualiser le suivi
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              <TableCaption>
                {loading ? 'Chargement...' : `${shipments.length} résultat(s) sur cette page`}
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
    </div>
  )
}
