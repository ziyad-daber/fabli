'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
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
import { ProductStatusBadge } from '@/components/status-badge'
import { formatCurrency, formatDate } from '@/lib/utils/helpers'
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Loader2,
  AlertTriangle,
  Package,
  CheckCircle2,
  Ban,
  X,
} from 'lucide-react'

type ProductStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED'

interface ProductImage {
  id: string
  url: string
  isPrimary: boolean
  sortOrder: number
}

interface ProductRow {
  id: string
  name: string
  slug: string
  supplierPrice: string | number
  currency: string
  productionDays: number
  status: ProductStatus
  createdAt: string
  category: { id: string; name: string; slug: string } | null
  images: ProductImage[]
}

interface ProductsResponse {
  products: ProductRow[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

const STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: 'Brouillon',
  ACTIVE: 'Actif',
  DISABLED: 'Désactivé',
}

export default function SupplierProductsPage() {
  const [products, setProducts] = useState<ProductRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'success' | 'warning'; message: string } | null>(
    null
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null)

  const fetchProducts = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' })
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const response = await fetch(`/api/products?${params.toString()}`, { signal })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur lors du chargement des produits')
      }

      const data: ProductsResponse = await response.json()
      setProducts(data.products || [])
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
    fetchProducts(controller.signal)
    return () => controller.abort()
  }, [fetchProducts])

  // La recherche repart systématiquement de la première page.
  useEffect(() => {
    const timer = setTimeout(() => setPage(1), 300)
    return () => clearTimeout(timer)
  }, [search, statusFilter])

  async function handleToggleStatus(product: ProductRow) {
    const nextStatus: ProductStatus = product.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
    setBusyId(product.id)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du changement de statut')
      }
      setNotice({
        type: 'success',
        message: `« ${product.name} » est maintenant ${STATUS_LABELS[nextStatus].toLowerCase()}.`,
      })
      await fetchProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du changement de statut')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeletingId(deleteTarget.id)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/products/${deleteTarget.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        // 409 : le produit est référencé par une commande, la désactivation
        // est la seule sortie — on le dit explicitement.
        setNotice({
          type: 'warning',
          message: data.error || 'Suppression impossible. Désactivez le produit à la place.',
        })
        setDeleteTarget(null)
        return
      }
      setNotice({ type: 'success', message: `« ${deleteTarget.name} » a été supprimé.` })
      setDeleteTarget(null)
      await fetchProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression')
    } finally {
      setDeletingId(null)
    }
  }

  function renderThumb(product: ProductRow) {
    const image = product.images?.find((img) => img.isPrimary) ?? product.images?.[0]
    if (!image) {
      return (
        <div className="h-10 w-10 shrink-0 rounded-md border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center">
          <Package className="h-4 w-4 text-gray-400" />
        </div>
      )
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image.url}
        alt={product.name}
        className="h-10 w-10 shrink-0 rounded-md border border-gray-200 object-cover"
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes produits</h1>
          <p className="text-gray-500">
            {loading ? 'Chargement...' : `${total} produit${total > 1 ? 's' : ''} au catalogue`}
          </p>
        </div>
        <Link href="/dashboard/supplier/products/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau produit
          </Button>
        </Link>
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un produit..."
            className="pl-10"
            aria-label="Rechercher un produit"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="status-filter" className="shrink-0 mb-0">
            Statut :
          </Label>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value)
              setPage(1)
            }}
          >
            <SelectTrigger id="status-filter" className="w-[180px]">
              <SelectValue placeholder="Tous" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="ACTIVE">Actif</SelectItem>
              <SelectItem value="DRAFT">Brouillon</SelectItem>
              <SelectItem value="DISABLED">Désactivé</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {notice && (
        <div
          className={
            notice.type === 'warning'
              ? 'flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900'
              : 'flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 p-3 text-green-800'
          }
        >
          {notice.type === 'warning' ? (
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          )}
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
          ) : products.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">Aucun produit</h3>
              <p className="text-gray-500 mt-1">
                {search || statusFilter !== 'all'
                  ? 'Aucun produit ne correspond à vos filtres.'
                  : 'Commencez par créer votre premier produit.'}
              </p>
              <Link href="/dashboard/supplier/products/new" className="mt-4 inline-block">
                <Button>Créer un produit</Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead className="hidden md:table-cell">Catégorie</TableHead>
                  <TableHead className="text-right">Prix fournisseur</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Fabrication</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden xl:table-cell">Créé le</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {renderThumb(product)}
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{product.name}</p>
                          <p className="text-xs text-gray-500 truncate">{product.slug}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-gray-600">
                      {product.category?.name || '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium text-gray-900">
                      {formatCurrency(Number(product.supplierPrice), product.currency)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right text-gray-600">
                      {product.productionDays} j
                    </TableCell>
                    <TableCell>
                      <ProductStatusBadge status={product.status} />
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-gray-600">
                      {formatDate(product.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleStatus(product)}
                          disabled={busyId === product.id || deletingId === product.id}
                        >
                          {busyId === product.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : product.status === 'ACTIVE' ? (
                            <Ban className="h-4 w-4 mr-2" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                          )}
                          {product.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}
                        </Button>
                        <Link href={`/dashboard/supplier/products/${product.id}/edit`}>
                          <Button variant="outline" size="icon" title="Modifier le produit">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => setDeleteTarget(product)}
                          disabled={busyId === product.id || deletingId === product.id}
                          title="Supprimer le produit"
                        >
                          {deletingId === product.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableCaption>
                {products.length} résultat(s) sur cette page
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

      {/* Confirmation de suppression */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-gray-900">Supprimer le produit</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteTarget(null)}
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-gray-600">
              Voulez-vous vraiment supprimer « {deleteTarget.name} » ? Cette action est
              irréversible. Si le produit apparaît dans une commande, préférez le
              désactiver.
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Annuler
              </Button>
              <Button variant="destructive" onClick={handleDelete} loading={!!deletingId}>
                Supprimer définitivement
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
