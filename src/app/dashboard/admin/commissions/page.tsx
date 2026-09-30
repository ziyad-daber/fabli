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
import { CommissionStatusBadge, OrderStatusBadge } from '@/components/status-badge'
import { formatCurrency, formatDate } from '@/lib/utils/helpers'
import { AlertTriangle, Download, Loader2, Search } from 'lucide-react'

type Decimal = string | number | null
type CommissionStatus = 'PENDING' | 'DUE' | 'PAID' | 'DISPUTED' | 'REFUNDED'

const STATUS_LABELS: Record<CommissionStatus, string> = {
  PENDING: 'En attente',
  DUE: 'Dûe',
  PAID: 'Réglée',
  DISPUTED: 'Contestée',
  REFUNDED: 'Remboursée',
}

const STATUS_ORDER: CommissionStatus[] = [
  'PENDING',
  'DUE',
  'PAID',
  'DISPUTED',
  'REFUNDED',
]

interface Commission {
  id: string
  rate: Decimal
  amount: Decimal
  currency: string
  status: CommissionStatus
  calculatedAt: string
  dueAt: string | null
  paidAt: string | null
  notes: string | null
  order: {
    id: string
    orderNumber: string
    status: string
    currency: string
    grossMargin: Decimal
    netMargin: Decimal
    supplier: { id: string; companyName: string }
    reseller: { id: string; companyName: string }
  }
}

interface CommissionsResponse {
  commissions: Commission[]
  totals: Record<string, { count: number; amount: number }>
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

function amount(value: Decimal): number {
  const parsed = typeof value === 'string' ? parseFloat(value) : (value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function AdminCommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [totals, setTotals] = useState<Record<string, { count: number; amount: number }>>({})
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState<Commission | null>(null)
  const [editStatus, setEditStatus] = useState<CommissionStatus>('PAID')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const fetchCommissions = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: '20',
        })
        if (search) params.set('search', search)
        if (statusFilter !== 'all') params.set('status', statusFilter)
        if (overdueOnly) params.set('overdue', 'true')

        const response = await fetch(`/api/admin/commissions?${params.toString()}`, { signal })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data.error || 'Erreur lors du chargement des commissions')
        }

        const payload: CommissionsResponse = data
        setCommissions(payload.commissions ?? [])
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
    [page, search, statusFilter, overdueOnly]
  )

  useEffect(() => {
    const controller = new AbortController()
    void fetchCommissions(controller.signal)
    return () => controller.abort()
  }, [fetchCommissions])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, overdueOnly])

  function openEditDialog(commission: Commission) {
    setEditing(commission)
    setEditStatus(commission.status)
    setEditNotes(commission.notes ?? '')
    setDialogError(null)
  }

  async function saveStatus() {
    if (!editing) return
    setSaving(true)
    setDialogError(null)
    try {
      const response = await fetch('/api/admin/commissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          status: editStatus,
          notes: editNotes || undefined,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la mise à jour de la commission')
      }
      setEditing(null)
      const controller = new AbortController()
      await fetchCommissions(controller.signal)
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour')
    } finally {
      setSaving(false)
    }
  }

  function exportCsv() {
    const params = new URLSearchParams({ format: 'csv' })
    if (search) params.set('search', search)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (overdueOnly) params.set('overdue', 'true')
    window.location.href = `/api/admin/commissions?${params.toString()}`
  }

  const isOverdue = (commission: Commission) =>
    commission.dueAt !== null &&
    new Date(commission.dueAt).getTime() < Date.now() &&
    (commission.status === 'PENDING' || commission.status === 'DUE')

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commissions</h1>
          <p className="text-gray-500">
            {total} commission{total > 1 ? 's' : ''} sur la plateforme
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="h-4 w-4 mr-2" />
          Exporter CSV
        </Button>
      </div>

      {/* Totaux par statut */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {STATUS_ORDER.map((status) => {
          const entry = totals[status]
          return (
            <Card key={status}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">
                  {STATUS_LABELS[status]}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-gray-900">
                  {formatCurrency(amount(entry?.amount ?? 0))}
                </div>
                <p className="text-xs text-gray-500">{entry?.count ?? 0} commission(s)</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par commande, fournisseur ou revendeur..."
            className="pl-10"
            aria-label="Rechercher une commission"
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

        <label className="flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          En retard
        </label>
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
                  <TableHead>Commande</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Revendeur</TableHead>
                  <TableHead className="text-right">Taux</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="px-6 py-4 text-center text-gray-500">
                      Aucune commission trouvée
                    </TableCell>
                  </TableRow>
                ) : (
                  commissions.map((commission) => {
                    const late = isOverdue(commission)
                    return (
                      <TableRow key={commission.id}>
                        <TableCell>
                          <div className="font-medium text-gray-900">{commission.order.orderNumber}</div>
                          <OrderStatusBadge status={commission.order.status} />
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {commission.order.supplier.companyName}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {commission.order.reseller.companyName}
                        </TableCell>
                        <TableCell className="text-right text-gray-600">
                          {Math.round(amount(commission.rate) * 1000) / 10} %
                        </TableCell>
                        <TableCell className="text-right font-medium text-gray-900">
                          {formatCurrency(amount(commission.amount), commission.currency || 'MAD')}
                        </TableCell>
                        <TableCell>
                          <CommissionStatusBadge status={commission.status} />
                          {late && (
                            <span className="ml-2 text-xs font-medium text-red-700">
                              en retard
                            </span>
                          )}
                        </TableCell>
                        <TableCell className={late ? 'text-red-700' : 'text-gray-600'}>
                          {commission.dueAt ? formatDate(commission.dueAt) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(commission)}
                          >
                            Modifier
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

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier la commission</DialogTitle>
            <DialogDescription>
              {editing
                ? `Commande ${editing.order.orderNumber} — ${formatCurrency(
                    amount(editing.amount),
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
            <div className="grid gap-2">
              <Label htmlFor="commission-status">Statut</Label>
              <Select
                value={editStatus}
                onValueChange={(value) => setEditStatus(value as CommissionStatus)}
              >
                <SelectTrigger id="commission-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="commission-notes">Notes</Label>
              <Textarea
                id="commission-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                placeholder="Motif du changement de statut..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={saveStatus} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
