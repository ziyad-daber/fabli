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
import { Search, Plus, Edit, Trash2, Loader2, AlertTriangle, Shield, X } from 'lucide-react'

// Types

type UserRole = 'ADMIN' | 'SUPPLIER' | 'RESELLER'
type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION'

interface Profile {
  id: string
  companyName: string
  contactName: string
  phone: string
  address: string
  city: string
  postalCode: string | null
  ice: string | null
  rc: string | null
  isVerified: boolean
}

interface UserData {
  id: string
  email: string
  role: UserRole
  status: UserStatus
  emailVerified: string | null
  createdAt: string
  lastLoginAt: string | null
  supplierProfile: Profile | null
  resellerProfile: Profile | null
}

interface PaginatedResponse {
  users: UserData[]
  total: number
  page: number
  limit: number
  totalPages: number
}

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrateur',
  SUPPLIER: 'Fournisseur',
  RESELLER: 'Revendeur',
}

const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
  SUSPENDED: 'Suspendu',
  PENDING_VERIFICATION: 'En attente',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('fr-MA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserData[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Create / edit modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserData | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    role: 'RESELLER' as UserRole,
    status: 'PENDING_VERIFICATION' as UserStatus,
    password: '',
  })

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
      })
      if (search) params.set('search', search)
      if (roleFilter !== 'all') params.set('role', roleFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const response = await fetch(`/api/admin/users?${params.toString()}`)
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur lors du chargement des utilisateurs')
      }

      const data: PaginatedResponse = await response.json()
      setUsers(data.users || [])
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }, [page, search, roleFilter, statusFilter])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Debounce the search box so we do not fire a request per keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
    }, 0)
    return () => clearTimeout(timer)
  }, [search])

  function handleSearchChange(value: string) {
    setSearch(value)
  }

  function openCreateModal() {
    setEditingUser(null)
    setFormData({
      email: '',
      role: 'RESELLER',
      status: 'PENDING_VERIFICATION',
      password: '',
    })
    setFormError(null)
    setFormSuccess(null)
    setIsModalOpen(true)
  }

  function openEditModal(user: UserData) {
    setEditingUser(user)
    setFormData({
      email: user.email,
      role: user.role,
      status: user.status,
      password: '',
    })
    setFormError(null)
    setFormSuccess(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingUser(null)
    setFormError(null)
  }

  async function handleSave() {
    setSaving(true)
    setFormError(null)
    setFormSuccess(null)
    try {
      const isCreate = editingUser === null
      const response = await fetch(
        isCreate ? '/api/admin/users' : `/api/admin/users/${editingUser.id}`,
        {
          method: isCreate ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isCreate
              ? formData
              : { email: formData.email, role: formData.role, status: formData.status }
          ),
        }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la sauvegarde')
      }

      setFormSuccess(isCreate ? 'Utilisateur créé avec succès' : 'Utilisateur mis à jour')
      await fetchUsers()
      setTimeout(() => {
        setIsModalOpen(false)
        setEditingUser(null)
      }, 800)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleStatus(user: UserData) {
    try {
      const nextStatus: UserStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
      const response = await fetch(`/api/admin/users/${user.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du changement de statut')
      }

      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du changement de statut')
    }
  }

  async function handleDelete(user: UserData) {
    const confirmed = window.confirm(
      `Supprimer ${user.email} ? Cette action est irréversible.`
    )
    if (!confirmed) return

    setDeletingId(user.id)
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la suppression')
      }

      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression')
    } finally {
      setDeletingId(null)
    }
  }

  function renderStatusBadge(status: UserStatus) {
    const styles: Record<UserStatus, string> = {
      ACTIVE: 'bg-green-100 text-green-800',
      INACTIVE: 'bg-gray-100 text-gray-800',
      SUSPENDED: 'bg-red-100 text-red-800',
      PENDING_VERIFICATION: 'bg-yellow-100 text-yellow-800',
    }

    return <Badge className={styles[status]}>{STATUS_LABELS[status]}</Badge>
  }

  function renderRoleBadge(role: UserRole) {
    const styles: Record<UserRole, string> = {
      ADMIN: 'bg-purple-100 text-purple-800',
      SUPPLIER: 'bg-blue-100 text-blue-800',
      RESELLER: 'bg-green-100 text-green-800',
    }

    return <Badge className={styles[role]}>{ROLE_LABELS[role]}</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des utilisateurs</h1>
          <p className="text-gray-500">
            {total} utilisateur{total > 1 ? 's' : ''} sur la plateforme
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-2" />
          Nouvel utilisateur
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Rechercher par email..."
            className="pl-10"
          />
        </div>

        <Select
          value={roleFilter}
          onValueChange={(value) => {
            setRoleFilter(value)
            setPage(1)
          }}
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Tous les rôles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les rôles</SelectItem>
            <SelectItem value="ADMIN">Administrateurs</SelectItem>
            <SelectItem value="SUPPLIER">Fournisseurs</SelectItem>
            <SelectItem value="RESELLER">Revendeurs</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value)
            setPage(1)
          }}
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="ACTIVE">Actifs</SelectItem>
            <SelectItem value="INACTIVE">Inactifs</SelectItem>
            <SelectItem value="SUSPENDED">Suspendus</SelectItem>
            <SelectItem value="PENDING_VERIFICATION">En attente</SelectItem>
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
                  <TableHead>Email</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Entreprise</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Inscription</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="px-6 py-4 text-center text-gray-500">
                      Aucun utilisateur trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => {
                    const profile = user.supplierProfile || user.resellerProfile
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium text-gray-900">
                          {user.email}
                        </TableCell>
                        <TableCell>{renderRoleBadge(user.role)}</TableCell>
                        <TableCell className="text-gray-600">
                          {profile ? (
                            <div>
                              <p className="font-medium text-gray-900">{profile.companyName}</p>
                              <p className="text-xs text-gray-500">
                                {profile.city}
                                {profile.isVerified ? ' · Vérifié' : ''}
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>{renderStatusBadge(user.status)}</TableCell>
                        <TableCell className="text-gray-600">{formatDate(user.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleStatus(user)}
                            >
                              {user.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => openEditModal(user)}
                              title="Modifier l'utilisateur"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="icon"
                              onClick={() => handleDelete(user)}
                              disabled={deletingId === user.id}
                              title="Supprimer l'utilisateur"
                            >
                              {deletingId === user.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
              <TableCaption>
                {loading ? 'Chargement...' : `${users.length} résultat(s) sur cette page`}
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

      {/* Create / Edit modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {editingUser ? "Modifier l'utilisateur" : 'Créer un nouvel utilisateur'}
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

            {formSuccess && (
              <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-green-800 text-sm">
                {formSuccess}
              </div>
            )}

            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="email@exemple.com"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="role">Rôle *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, role: value as UserRole }))
                  }
                >
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Sélectionner un rôle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Administrateur</SelectItem>
                    <SelectItem value="SUPPLIER">Fournisseur</SelectItem>
                    <SelectItem value="RESELLER">Revendeur</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="status">Statut *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, status: value as UserStatus }))
                  }
                >
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Sélectionner un statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Actif</SelectItem>
                    <SelectItem value="INACTIVE">Inactif</SelectItem>
                    <SelectItem value="SUSPENDED">Suspendu</SelectItem>
                    <SelectItem value="PENDING_VERIFICATION">En attente de vérification</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {!editingUser && (
                <div className="grid gap-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, password: e.target.value }))
                    }
                    placeholder="Laisser vide pour générer un mot de passe"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={closeModal} disabled={saving}>
                Annuler
              </Button>
              <Button onClick={handleSave} disabled={saving || !formData.email}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Enregistrer
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
