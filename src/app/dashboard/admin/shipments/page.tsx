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
import { Search, Loader2, AlertTriangle, Eye, Truck, X, ExternalLink } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/helpers'

type ShipmentStatus =
  | 'CREATED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'
  | 'RETURNED'
  | 'ERROR'

interface ShipmentData {
  id: string
  trackingCode: string | null
  externalId: string | null
  labelUrl: string | null
  status: ShipmentStatus
  carrier: string
  pieces: number
  weight: string | number | null
  codAmount: string | number | null
  errorMessage: string | null
  createdAt: string
  pickedUpAt: string | null
  deliveredAt: string | null
  lastTrackingAt: string | null
  order: {
    id: string
    orderNumber: string
    customerName: string
    customerPhone: string
    customerAddress: string
    customerCity: string
    customerPostalCode: string | null
  } | null
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

const STATUS_STYLES: Record<ShipmentStatus, string> = {
  CREATED: 'bg-gray-100 text-gray-800',
  PICKED_UP: 'bg-blue-100 text-blue-800',
  IN_TRANSIT: 'bg-orange-100 text-orange-800',
  OUT_FOR_DELIVERY: 'bg-cyan-100 text-cyan-800',
  DELIVERED: 'bg-green-100 text-green-800',
  DELIVERY_FAILED: 'bg-red-100 text-red-800',
  RETURNED: 'bg-gray-200 text-gray-800',
  ERROR: 'bg-red-200 text-red-900',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('fr-MA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function AdminShipmentsPage() {
  const [shipments, setShipments] = useState<ShipmentData[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedShipment, setSelectedShipment] = useState<ShipmentData | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchShipments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '15' })
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const response = await fetch(`/api/admin/shipments?${params.toString()}`)
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur lors du chargement des expéditions')
      }

      const data = await response.json()
      setShipments(data.shipments || [])
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => {
    fetchShipments()
  }, [fetchShipments])

  function openDetailsModal(shipment: ShipmentData) {
    setSelectedShipment(shipment)
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setSelectedShipment(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gestion des expéditions</h1>
        <p className="text-gray-500">
          {total} expédition{total > 1 ? 's' : ''} suivie{total > 1 ? 's' : ''} via AMEEX
        </p>
      </div>

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Rechercher par numéro de suivi, commande, client..."
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
            {(Object.keys(STATUS_LABELS) as ShipmentStatus[]).map((status) => (
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
                  <TableHead>Suivi</TableHead>
                  <TableHead>Commande</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>COD</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="px-6 py-4 text-center text-gray-500">
                      Aucune expédition trouvée
                    </TableCell>
                  </TableRow>
                ) : (
                  shipments.map((shipment) => (
                    <TableRow key={shipment.id}>
                      <TableCell>
                        <p className="font-medium text-gray-900">
                          {shipment.trackingCode || '—'}
                        </p>
                        <p className="text-xs text-gray-500">{shipment.carrier}</p>
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {shipment.order?.orderNumber || '—'}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-gray-900">
                          {shipment.order?.customerName || '—'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {shipment.order?.customerCity || ''}
                        </p>
                      </TableCell>
                      <TableCell>
                        {shipment.codAmount != null
                          ? formatCurrency(Number(shipment.codAmount))
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLES[shipment.status]}>
                          {STATUS_LABELS[shipment.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {formatDate(shipment.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {shipment.labelUrl && (
                            <Button asChild variant="outline" size="icon" title="Ouvrir l'étiquette">
                              <a href={shipment.labelUrl} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDetailsModal(shipment)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Détails
                          </Button>
                        </div>
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

      {/* Shipment details modal */}
      {isModalOpen && selectedShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {selectedShipment.trackingCode || 'Expédition'}
                </h2>
                <Badge className={`mt-1 ${STATUS_STYLES[selectedShipment.status]}`}>
                  {STATUS_LABELS[selectedShipment.status]}
                </Badge>
              </div>
              <Button variant="ghost" size="icon" onClick={closeModal} aria-label="Fermer">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {selectedShipment.errorMessage && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="text-sm">{selectedShipment.errorMessage}</span>
              </div>
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-900">Expédition</h3>
                <p className="text-sm text-gray-600">Transporteur : {selectedShipment.carrier}</p>
                <p className="text-sm text-gray-600">Colis : {selectedShipment.pieces}</p>
                {selectedShipment.weight != null && (
                  <p className="text-sm text-gray-600">
                    Poids : {Number(selectedShipment.weight)} kg
                  </p>
                )}
                {selectedShipment.codAmount != null && (
                  <p className="text-sm text-gray-600">
                    Montant COD : {formatCurrency(Number(selectedShipment.codAmount))}
                  </p>
                )}
                {selectedShipment.externalId && (
                  <p className="text-sm text-gray-600">
                    ID AMEEX : {selectedShipment.externalId}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-gray-900">Suivi</h3>
                <p className="text-sm text-gray-600">
                  Créée le : {formatDate(selectedShipment.createdAt)}
                </p>
                <p className="text-sm text-gray-600">
                  Collectée le : {formatDate(selectedShipment.pickedUpAt)}
                </p>
                <p className="text-sm text-gray-600">
                  Livrée le : {formatDate(selectedShipment.deliveredAt)}
                </p>
                <p className="text-sm text-gray-600">
                  Dernière synchro : {formatDate(selectedShipment.lastTrackingAt)}
                </p>
              </div>
            </div>

            {selectedShipment.order && (
              <div className="mt-6 pt-4 border-t border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-2">Destinataire</h3>
                <p className="text-sm text-gray-700">{selectedShipment.order.customerName}</p>
                <p className="text-sm text-gray-600">{selectedShipment.order.customerPhone}</p>
                <p className="text-sm text-gray-600">{selectedShipment.order.customerAddress}</p>
                <p className="text-sm text-gray-600">
                  {selectedShipment.order.customerCity}{' '}
                  {selectedShipment.order.customerPostalCode || ''}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Commande : {selectedShipment.order.orderNumber}
                </p>
              </div>
            )}

            {selectedShipment.labelUrl && (
              <div className="mt-6 flex justify-end">
                <Button asChild variant="outline">
                  <a href={selectedShipment.labelUrl} target="_blank" rel="noreferrer">
                    <Truck className="h-4 w-4 mr-2" />
                    Ouvrir l'étiquette
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
