'use client'

import { useCallback, useEffect, useState } from 'react'
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Pagination,
  PaginationList,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui'
import { UserStatusBadge } from '@/components/status-badge'
import { formatDate } from '@/lib/utils/helpers'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Search,
  Shield,
  Ban,
  RotateCcw,
} from 'lucide-react'

type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION'

interface SupplierProfile {
  id: string
  companyName: string
  contactName: string | null
  phone: string | null
  address: string | null
  city: string | null
  postalCode: string | null
  ice: string | null
  rc: string | null
  isVerified: boolean
}

interface SupplierUser {
  id: string
  email: string
  role: string
  status: UserStatus
  createdAt: string
  lastLoginAt: string | null
  supplierProfile: SupplierProfile | null
}

interface SuppliersResponse {
  users: SupplierUser[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export default function AdminSuppliersPage() {
  const [suppliers, setSuppliers] = useState<SupplierUser[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const fetchSuppliers = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          role: 'SUPPLIER',
          page: String(page),
          limit: '10',
        })
        if (search) params.set('search', search)
        if (statusFilter !== 'all') params.set('status', statusFilter)

        const response = await fetch(`/api/admin/users?${params.toString()}`, { signal })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data.error || 'Erreur lors du chargement des fournisseurs')
        }

        const payload: SuppliersResponse = data
        setSuppliers(payload.users ?? [])
        setTotal(payload.total ?? 0)
        setTotalPages(payload.totalPages ?? 0)
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
    void fetchSuppliers(controller.signal)
    return () => controller.abort()
  }, [fetchSuppliers])

  // La recherche repart toujours de la première page : un filtre plus restrictif
  // rendrait sinon la page courante vide.
  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

  async function changeStatus(user: SupplierUser, status: UserStatus) {
    const confirmations: Partial<Record<UserStatus, string>> = {
      SUSPENDED: `Suspendre ${user.email} ? Il ne pourra plus se connecter.`,
    }
    if (confirmations[status] && !window.confirm(confirmations[status] as string)) return

    setPendingId(user.id)
    setActionError(null)
    try {
      const response = await fetch(`/api/admin/users/${user.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du changement de statut')
      }
      const controller = new AbortController()
      await fetchSuppliers(controller.signal)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erreur lors du changement de statut')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fournisseurs</h1>
          <p className="text-gray-500">
            {total} fournisseur{total > 1 ? 's' : ''} inscrit{total > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par email..."
            className="pl-10"
            aria-label="Rechercher un fournisseur"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="PENDING_VERIFICATION">En attente de validation</SelectItem>
            <SelectItem value="ACTIVE">Actifs</SelectItem>
            <SelectItem value="INACTIVE">Inactifs</SelectItem>
            <SelectItem value="SUSPENDED">Suspendus</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {actionError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{actionError}</span>
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
                  <TableHead>Entreprise</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Ville</TableHead>
                  <TableHead>Profil</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Inscription</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="px-6 py-4 text-center text-gray-500">
                      Aucun fournisseur trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  suppliers.map((user) => {
                    const profile = user.supplierProfile
                    const busy = pendingId === user.id
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium text-gray-900">
                          {profile?.companyName ?? <span className="text-gray-400">—</span>}
                        </TableCell>
                        <TableCell className="text-gray-600">{user.email}</TableCell>
                        <TableCell className="text-gray-600">
                          {profile ? (
                            <div>
                              <p>{profile.contactName ?? '—'}</p>
                              <p className="text-xs text-gray-500">{profile.phone ?? '—'}</p>
                            </div>
                          ) : (
                            <span className="text-gray-400">Profil incomplet</span>
                          )}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {profile?.city ? `${profile.city} ${profile.postalCode ?? ''}`.trim() : '—'}
                        </TableCell>
                        <TableCell>
                          {profile ? (
                            <span
                              className={
                                profile.isVerified
                                  ? 'text-sm text-green-700'
                                  : 'text-sm text-amber-700'
                              }
                            >
                              {profile.isVerified ? 'Vérifié' : 'Non vérifié'}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <UserStatusBadge status={user.status} />
                        </TableCell>
                        <TableCell className="text-gray-600">{formatDate(user.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {user.status !== 'ACTIVE' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => changeStatus(user, 'ACTIVE')}
                              >
                                {busy ? (
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                )}
                                Valider
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => changeStatus(user, 'INACTIVE')}
                              >
                                {busy ? (
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-4 w-4 mr-1" />
                                )}
                                Désactiver
                              </Button>
                            )}

                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={busy || user.status === 'SUSPENDED'}
                              onClick={() => changeStatus(user, 'SUSPENDED')}
                            >
                              <Ban className="h-4 w-4 mr-1" />
                              Suspendre
                            </Button>
                          </div>
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
        <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        La validation active le compte du fournisseur ; la suspension lui retire l’accès à la
        plateforme sans supprimer son historique de commandes.
      </p>
    </div>
  )
}
