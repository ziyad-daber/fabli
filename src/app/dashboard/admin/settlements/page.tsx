'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  Button,
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
import { SettlementStatusBadge } from '@/components/status-badge'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils/helpers'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  Settings2,
} from 'lucide-react'

type Decimal = string | number | null
type SettlementStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DISPUTED'

const STATUS_LABELS: Record<SettlementStatus, string> = {
  PENDING: 'En attente',
  PROCESSING: 'En cours',
  COMPLETED: 'Payé',
  FAILED: 'Échec',
  DISPUTED: 'Contesté',
}

const STATUS_ORDER: SettlementStatus[] = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'DISPUTED',
]

interface Transaction {
  id: string
  type: string
  amount: Decimal
  currency: string
  description: string | null
  reference: string | null
  createdAt: string
}

interface Settlement {
  id: string
  reference: string | null
  periodStart: string
  periodEnd: string
  totalCommission: Decimal
  totalCod: Decimal
  netAmount: Decimal
  currency: string
  status: SettlementStatus
  paidAt: string | null
  notes: string | null
  supplier: { id: string; companyName: string; userId: string }
  transactions: Transaction[]
}

interface SettlementsResponse {
  settlements: Settlement[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

interface SupplierOption {
  id: string
  companyName: string
}

function amount(value: Decimal): number {
  const parsed = typeof value === 'string' ? parseFloat(value) : (value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function AdminSettlementsPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ supplierId: '', periodStart: '', periodEnd: '', notes: '' })
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [editing, setEditing] = useState<Settlement | null>(null)
  const [editForm, setEditForm] = useState({ status: 'PROCESSING' as SettlementStatus, reference: '', notes: '' })
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchSettlements = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' })
        if (statusFilter !== 'all') params.set('status', statusFilter)
        if (supplierFilter !== 'all') params.set('supplierId', supplierFilter)

        const response = await fetch(`/api/admin/settlements?${params.toString()}`, { signal })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data.error || 'Erreur lors du chargement des règlements')
        }

        const payload: SettlementsResponse = data
        setSettlements(payload.settlements ?? [])
        setTotalPages(payload.pagination?.totalPages ?? 0)
        setTotal(payload.pagination?.total ?? 0)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Une erreur est survenue')
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    },
    [page, statusFilter, supplierFilter]
  )

  useEffect(() => {
    const controller = new AbortController()
    void fetchSettlements(controller.signal)
    return () => controller.abort()
  }, [fetchSettlements])

  useEffect(() => {
    setPage(1)
  }, [statusFilter, supplierFilter])

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch('/api/suppliers', { signal: controller.signal })
        if (!response.ok) return
        const data = (await response.json()) as { suppliers?: SupplierOption[] }
        setSuppliers(data.suppliers ?? [])
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }
    void load()
    return () => controller.abort()
  }, [])

  async function refresh() {
    const controller = new AbortController()
    await fetchSettlements(controller.signal)
  }

  async function handleCreate() {
    setCreating(true)
    setCreateError(null)
    try {
      const response = await fetch('/api/admin/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: createForm.supplierId,
          periodStart: createForm.periodStart,
          periodEnd: createForm.periodEnd,
          notes: createForm.notes || undefined,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la création du règlement')
      }
      setCreateOpen(false)
      setCreateForm({ supplierId: '', periodStart: '', periodEnd: '', notes: '' })
      await refresh()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erreur lors de la création')
    } finally {
      setCreating(false)
    }
  }

  function openEditDialog(settlement: Settlement) {
    setEditing(settlement)
    setEditForm({
      status: settlement.status,
      reference: settlement.reference ?? '',
      notes: settlement.notes ?? '',
    })
    setEditError(null)
  }

  async function handleUpdate() {
    if (!editing) return
    setSaving(true)
    setEditError(null)
    try {
      const response = await fetch('/api/admin/settlements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          status: editForm.status,
          reference: editForm.reference || undefined,
          notes: editForm.notes || undefined,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la mise à jour du règlement')
      }
      setEditing(null)
      await refresh()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour')
    } finally {
      setSaving(false)
    }
  }

  function exportCsv() {
    const params = new URLSearchParams({ format: 'csv' })
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (supplierFilter !== 'all') params.set('supplierId', supplierFilter)
    window.location.href = `/api/admin/settlements?${params.toString()}`
  }

  const canCreate =
    createForm.supplierId !== '' &&
    createForm.periodStart !== '' &&
    createForm.periodEnd !== ''

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Règlements fournisseurs</h1>
          <p className="text-gray-500">
            {total} règlement{total > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" />
            Exporter CSV
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau règlement
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="sm:w-72">
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
          ) : settlements.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Aucun règlement trouvé</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Référence</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Période</TableHead>
                  <TableHead className="text-right">Montant net</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlements.map((settlement) => {
                  const isExpanded = expanded === settlement.id
                  return (
                    <Fragment key={settlement.id}>
                    <TableRow>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setExpanded(isExpanded ? null : settlement.id)}
                          aria-label={
                            isExpanded
                              ? 'Masquer les transactions'
                              : 'Afficher les transactions'
                          }
                          className="text-gray-500 hover:text-gray-900"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium text-gray-900">
                        {settlement.reference ?? '—'}
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {settlement.supplier.companyName}
                      </TableCell>
                      <TableCell className="text-gray-600 text-sm">
                        {formatDate(settlement.periodStart)} → {formatDate(settlement.periodEnd)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-gray-900">
                        {formatCurrency(amount(settlement.netAmount), settlement.currency || 'MAD')}
                      </TableCell>
                      <TableCell>
                        <SettlementStatusBadge status={settlement.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(settlement)}
                        >
                          <Settings2 className="h-4 w-4 mr-1" />
                          Statut
                        </Button>
                      </TableCell>
                    </TableRow>

                      {isExpanded && (
                        <TableRow>
                        <TableCell colSpan={7} className="bg-gray-50 px-6 py-4">
                          <div className="grid gap-4 sm:grid-cols-4">
                            <div>
                              <p className="text-xs text-gray-500">Commissions</p>
                              <p className="text-sm font-medium text-gray-900">
                                {formatCurrency(
                                  amount(settlement.totalCommission),
                                  settlement.currency || 'MAD'
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">COD couvert</p>
                              <p className="text-sm font-medium text-gray-900">
                                {formatCurrency(
                                  amount(settlement.totalCod),
                                  settlement.currency || 'MAD'
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Réglé le</p>
                              <p className="text-sm font-medium text-gray-900">
                                {settlement.paidAt ? formatDate(settlement.paidAt) : '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Notes</p>
                              <p className="text-sm text-gray-700">{settlement.notes ?? '—'}</p>
                            </div>
                          </div>

                          <Table className="mt-4 bg-white">
                            <TableHeader>
                              <TableRow>
                                <TableHead>Type</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Référence</TableHead>
                                <TableHead className="text-right">Montant</TableHead>
                                <TableHead>Date</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {settlement.transactions.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={5} className="text-center text-gray-500">
                                    Aucune transaction
                                  </TableCell>
                                </TableRow>
                              ) : (
                                settlement.transactions.map((transaction) => (
                                  <TableRow key={transaction.id}>
                                    <TableCell className="text-xs text-gray-600">
                                      {transaction.type}
                                    </TableCell>
                                    <TableCell className="text-gray-700">
                                      {transaction.description ?? '—'}
                                    </TableCell>
                                    <TableCell className="text-gray-600">
                                      {transaction.reference ?? '—'}
                                    </TableCell>
                                    <TableCell className="text-right text-gray-900">
                                      {formatCurrency(
                                        amount(transaction.amount),
                                        transaction.currency || 'MAD'
                                      )}
                                    </TableCell>
                                    <TableCell className="text-gray-600">
                                      {formatDateTime(transaction.createdAt)}
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
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

      {/* Nouveau règlement */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau règlement</DialogTitle>
            <DialogDescription>
              Regroupe les commissions des commandes livrées et non encore réglées sur la
              période.
            </DialogDescription>
          </DialogHeader>

          {createError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm">{createError}</span>
            </div>
          )}

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="settlement-supplier">Fournisseur *</Label>
              <Select
                value={createForm.supplierId}
                onValueChange={(value) =>
                  setCreateForm((prev) => ({ ...prev, supplierId: value }))
                }
              >
                <SelectTrigger id="settlement-supplier">
                  <SelectValue placeholder="Sélectionner un fournisseur" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="period-start">Début de période *</Label>
                <Input
                  id="period-start"
                  type="date"
                  value={createForm.periodStart}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, periodStart: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="period-end">Fin de période *</Label>
                <Input
                  id="period-end"
                  type="date"
                  value={createForm.periodEnd}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, periodEnd: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="settlement-notes">Notes</Label>
              <Textarea
                id="settlement-notes"
                value={createForm.notes}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, notes: e.target.value }))}
                rows={3}
                placeholder="Commentaire interne..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={creating || !canCreate}>
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Changement de statut */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suivi du règlement</DialogTitle>
            <DialogDescription>
              {editing
                ? `${editing.reference ?? editing.id} — ${formatCurrency(
                    amount(editing.netAmount),
                    editing.currency || 'MAD'
                  )}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {editError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm">{editError}</span>
            </div>
          )}

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="settlement-status">Statut</Label>
              <Select
                value={editForm.status}
                onValueChange={(value) =>
                  setEditForm((prev) => ({ ...prev, status: value as SettlementStatus }))
                }
              >
                <SelectTrigger id="settlement-status">
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
              <Label htmlFor="settlement-reference">Référence</Label>
              <Input
                id="settlement-reference"
                value={editForm.reference}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, reference: e.target.value }))
                }
                placeholder="Référence du virement"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="settlement-edit-notes">Notes</Label>
              <Textarea
                id="settlement-edit-notes"
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
            <Button onClick={handleUpdate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
