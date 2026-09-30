'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Pagination,
  PaginationList,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui'
import { CodStatusBadge } from '@/components/status-badge'
import { formatCurrency, formatDate } from '@/lib/utils/helpers'
import { AlertTriangle, Download, Loader2, Search, Wallet } from 'lucide-react'

type Decimal = string | number | null
type CodStatus = 'EXPECTED' | 'COLLECTED' | 'SETTLED' | 'DISCREPANCY' | 'REFUNDED'

const STATUS_LABELS: Record<CodStatus, string> = {
  EXPECTED: 'Attendu',
  COLLECTED: 'Encaissé',
  SETTLED: 'Reversé',
  DISCREPANCY: 'Écart',
  REFUNDED: 'Remboursé',
}

const STATUS_ORDER: CodStatus[] = [
  'EXPECTED',
  'COLLECTED',
  'SETTLED',
  'DISCREPANCY',
  'REFUNDED',
]

interface Shipment {
  id: string
  trackingCode: string | null
  carrier: string
  deliveredAt: string | null
}

interface CodCollection {
  id: string
  expectedAmount: Decimal
  collectedAmount: Decimal
  settledAmount: Decimal
  currency: string
  status: CodStatus
  collectedAt: string | null
  settledAt: string | null
  carrierReference: string | null
  notes: string | null
  order: {
    id: string
    orderNumber: string
    status: string
    customerName: string
    customerCity: string
    supplier: { id: string; companyName: string }
    shipments: Shipment[]
  }
}

interface CodResponse {
  collections: CodCollection[]
  totals: Record<
    string,
    { count: number; expected: number; collected: number; settled: number }
  >
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

function amount(value: Decimal): number {
  const parsed = typeof value === 'string' ? parseFloat(value) : (value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function AdminCodPage() {
  const [collections, setCollections] = useState<CodCollection[]>([])
  const [totals, setTotals] = useState<
    Record<string, { count: number; expected: number; collected: number; settled: number }>
  >({})
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState<CodCollection | null>(null)
  const [editForm, setEditForm] = useState({
    collectedAmount: '',
    settledAmount: '',
    carrierReference: '',
    notes: '',
    status: '' as CodStatus | '',
  })
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchCollections = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' })
        if (search) params.set('search', search)
        if (statusFilter !== 'all') params.set('status', statusFilter)

        const response = await fetch(`/api/admin/cod?${params.toString()}`, { signal })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data.error || 'Erreur lors du chargement des collectes COD')
        }

        const payload: CodResponse = data
        setCollections(payload.collections ?? [])
        setTotals(payload.totals ?? {})
        setTotalPages(payload.pagination?.totalPages ?? 0)
        setTotal(payload.pagination?.total ?? 0)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Une erreur est survenue')
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    },
    [page, search, statusFilter]
  )

  useEffect(() => {
    const controller = new AbortController()
    void fetchCollections(controller.signal)
    return () => controller.abort()
  }, [fetchCollections])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

  function openReconcileDialog(collection: CodCollection) {
    setEditing(collection)
    setEditForm({
      collectedAmount: String(amount(collection.collectedAmount)),
      settledAmount: String(amount(collection.settledAmount)),
      carrierReference: collection.carrierReference ?? '',
      notes: collection.notes ?? '',
      status: '',
    })
    setDialogError(null)
  }

  async function saveReconciliation() {
    if (!editing) return
    setSaving(true)
    setDialogError(null)
    try {
      const response = await fetch('/api/admin/cod', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          collectedAmount: Number(editForm.collectedAmount) || 0,
          settledAmount: Number(editForm.settledAmount) || 0,
          carrierReference: editForm.carrierReference || undefined,
          notes: editForm.notes || undefined,
          status: editForm.status || undefined,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du rapprochement')
      }
      setEditing(null)
      const controller = new AbortController()
      await fetchCollections(controller.signal)
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Erreur lors du rapprochement')
    } finally {
      setSaving(false)
    }
  }

  function exportCsv() {
    const params = new URLSearchParams({ format: 'csv' })
    if (search) params.set('search', search)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    window.location.href = `/api/admin/cod?${params.toString()}`
  }

  const totalExpected = Object.values(totals).reduce(
    (sum, entry) => sum + amount(entry.expected),
    0
  )
  const totalCollected = Object.values(totals).reduce(
    (sum, entry) => sum + amount(entry.collected),
    0
  )
  const totalSettled = Object.values(totals).reduce((sum, entry) => sum + amount(entry.settled), 0)
  const discrepancyCount = totals.DISCREPANCY?.count ?? 0

  const kpis = [
    { name: 'Montant attendu', value: formatCurrency(totalExpected), tone: 'text-gray-900' },
    { name: 'Montant encaissé', value: formatCurrency(totalCollected), tone: 'text-green-700' },
    { name: 'Montant reversé', value: formatCurrency(totalSettled), tone: 'text-blue-700' },
    {
      name: 'Écarts à traiter',
      value: String(discrepancyCount),
      tone: discrepancyCount > 0 ? 'text-red-700' : 'text-gray-900',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Code Suivi (COD)</h1>
          <p className="text-gray-500">
            {total} collecte{total > 1 ? 's' : ''} à rapprocher
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="h-4 w-4 mr-2" />
          Exporter CSV
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.name}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{kpi.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-xl font-bold ${kpi.tone}`}>{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par commande ou client..."
            className="pl-10"
            aria-label="Rechercher une collecte COD"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {STATUS_ORDER.map((status) => (
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
                  <TableHead>Commande</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Ville</TableHead>
                  <TableHead className="text-right">Attendu</TableHead>
                  <TableHead className="text-right">Encaissé</TableHead>
                  <TableHead className="text-right">Reversé</TableHead>
                  <TableHead className="text-right">Écart</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collections.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="px-6 py-4 text-center text-gray-500">
                      Aucune collecte trouvée
                    </TableCell>
                  </TableRow>
                ) : (
                  collections.map((collection) => {
                    const shipment = collection.order.shipments[0]
                    const expected = amount(collection.expectedAmount)
                    const collected = amount(collection.collectedAmount)
                    const settled = amount(collection.settledAmount)
                    const gap = Math.round((collected - expected) * 100) / 100
                    return (
                      <TableRow key={collection.id}>
                        <TableCell>
                          <div className="font-medium text-gray-900">
                            {shipment?.trackingCode ?? '—'}
                          </div>
                          {shipment?.deliveredAt && (
                            <p className="text-xs text-gray-500">
                              Livré le {formatDate(shipment.deliveredAt)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-gray-700">{collection.order.orderNumber}</TableCell>
                        <TableCell className="text-gray-600">{collection.order.customerName}</TableCell>
                        <TableCell className="text-gray-600">{collection.order.customerCity}</TableCell>
                        <TableCell className="text-right text-gray-900">
                          {formatCurrency(expected, collection.currency || 'MAD')}
                        </TableCell>
                        <TableCell className="text-right text-gray-900">
                          {formatCurrency(collected, collection.currency || 'MAD')}
                        </TableCell>
                        <TableCell className="text-right text-gray-600">
                          {formatCurrency(settled, collection.currency || 'MAD')}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            gap !== 0 ? 'text-red-700' : 'text-gray-400'
                          }`}
                        >
                          {formatCurrency(gap, collection.currency || 'MAD')}
                        </TableCell>
                        <TableCell>
                          <CodStatusBadge status={collection.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openReconcileDialog(collection)}
                          >
                            Rapprocher
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

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

      <p className="flex items-start gap-2 text-xs text-gray-500">
        <Wallet className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        Le montant réellement encaissé est saisi à partir du rapport du transporteur ; le serveur
        en déduit le statut, et signale tout écart entre l’attendu et l’encaissé.
      </p>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rapprocher la collecte</DialogTitle>
            <DialogDescription>
              {editing
                ? `Commande ${editing.order.orderNumber} — attendu ${formatCurrency(
                    amount(editing.expectedAmount),
                    editing.currency || 'MAD'
                  )}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {dialogError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm">{dialogError}</span>
            </div>
          )}

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="cod-collected">Montant encaissé</Label>
                <Input
                  id="cod-collected"
                  type="number"
                  min={0}
                  step="0.01"
                  value={editForm.collectedAmount}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, collectedAmount: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cod-settled">Montant reversé</Label>
                <Input
                  id="cod-settled"
                  type="number"
                  min={0}
                  step="0.01"
                  value={editForm.settledAmount}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, settledAmount: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="cod-carrier-reference">Référence transporteur</Label>
              <Input
                id="cod-carrier-reference"
                value={editForm.carrierReference}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, carrierReference: e.target.value }))
                }
                placeholder="N° de reversement AMEEX"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="cod-status">Statut (optionnel)</Label>
              <Select
                value={editForm.status || 'auto'}
                onValueChange={(value) =>
                  setEditForm((prev) => ({
                    ...prev,
                    status: value === 'auto' ? '' : (value as CodStatus),
                  }))
                }
              >
                <SelectTrigger id="cod-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Déduire de l’écart</SelectItem>
                  {STATUS_ORDER.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="cod-notes">Notes</Label>
              <Textarea
                id="cod-notes"
                value={editForm.notes}
                onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={saveReconciliation} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
