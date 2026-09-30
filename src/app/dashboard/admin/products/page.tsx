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
  Textarea,
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
  Search,
  Plus,
  Edit,
  Trash2,
  Loader2,
  AlertTriangle,
  Package,
  Star,
  X,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils/helpers'

type ProductStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED'

interface Category {
  id: string
  name: string
  slug: string
}

interface SupplierOption {
  id: string
  companyName: string
}

interface Variant {
  id: string
  name: string
  value: string
  additionalPrice: string | number
  stock: number
  isActive: boolean
}

interface ProductImage {
  id: string
  url: string
  isPrimary: boolean
}

interface ProductData {
  id: string
  name: string
  slug: string
  description: string
  shortDescription: string | null
  supplierId: string
  categoryId: string
  supplierPrice: string | number
  currency: string
  productionDays: number
  weight: string | number | null
  length: string | number | null
  width: string | number | null
  height: string | number | null
  status: ProductStatus
  isFeatured: boolean
  createdAt: string
  category: Category | null
  supplier: { id: string; companyName: string } | null
  images?: ProductImage[]
  variants?: Variant[]
}

interface ProductForm {
  name: string
  slug: string
  description: string
  shortDescription: string
  categoryId: string
  supplierId: string
  supplierPrice: string
  currency: string
  productionDays: string
  weight: string
  length: string
  width: string
  height: string
  status: ProductStatus
  isFeatured: boolean
}

const EMPTY_FORM: ProductForm = {
  name: '',
  slug: '',
  description: '',
  shortDescription: '',
  categoryId: '',
  supplierId: '',
  supplierPrice: '',
  currency: 'MAD',
  productionDays: '5',
  weight: '',
  length: '',
  width: '',
  height: '',
  status: 'DRAFT',
  isFeatured: false,
}

const STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: 'Brouillon',
  ACTIVE: 'Actif',
  DISABLED: 'Désactivé',
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
export default function AdminProductsPage() {
  const [products, setProducts] = useState<ProductData[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductData | null>(null)
  const [formData, setFormData] = useState<ProductForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' })
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (categoryFilter !== 'all') params.set('categoryId', categoryFilter)

      const response = await fetch(`/api/admin/products?${params.toString()}`)
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur lors du chargement des produits')
      }

      const data = await response.json()
      setProducts(data.products || [])
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, categoryFilter])

  const fetchLookups = useCallback(async () => {
    try {
      const [categoriesRes, suppliersRes] = await Promise.all([
        fetch('/api/categories'),
        fetch('/api/suppliers'),
      ])

      if (categoriesRes.ok) {
        const data = await categoriesRes.json()
        setCategories(data.categories || [])
      }

      if (suppliersRes.ok) {
        const data = await suppliersRes.json()
        setSuppliers(data.suppliers || [])
      }
    } catch (err) {
      console.error('Failed to load lookups:', err)
    }
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  useEffect(() => {
    fetchLookups()
  }, [fetchLookups])

  function openCreateModal() {
    setEditingProduct(null)
    setFormData({ ...EMPTY_FORM, supplierId: suppliers[0]?.id || '' })
    setFormError(null)
    setFormSuccess(null)
    setIsModalOpen(true)
  }

  function openEditModal(product: ProductData) {
    setEditingProduct(product)
    setFormData({
      name: product.name,
      slug: product.slug,
      description: product.description,
      shortDescription: product.shortDescription || '',
      categoryId: product.categoryId,
      supplierId: product.supplierId,
      supplierPrice: String(product.supplierPrice),
      currency: product.currency,
      productionDays: String(product.productionDays),
      weight: product.weight != null ? String(product.weight) : '',
      length: product.length != null ? String(product.length) : '',
      width: product.width != null ? String(product.width) : '',
      height: product.height != null ? String(product.height) : '',
      status: product.status,
      isFeatured: product.isFeatured,
    })
    setFormError(null)
    setFormSuccess(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingProduct(null)
    setFormError(null)
  }

  function handleFormChange(field: keyof ProductForm, value: string | boolean) {
    setFormData((prev) => {
      const next = { ...prev, [field]: value }
      // Keep the slug in sync while the user is still naming the product
      if (field === 'name' && !editingProduct) {
        next.slug = slugify(value as string)
      }
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setFormError(null)
    setFormSuccess(null)
    try {
      const isCreate = editingProduct === null
      const payload = {
        name: formData.name,
        slug: formData.slug,
        description: formData.description,
        shortDescription: formData.shortDescription || undefined,
        categoryId: formData.categoryId,
        supplierId: formData.supplierId,
        supplierPrice: Number(formData.supplierPrice),
        currency: formData.currency,
        productionDays: Number(formData.productionDays),
        weight: formData.weight ? Number(formData.weight) : undefined,
        length: formData.length ? Number(formData.length) : undefined,
        width: formData.width ? Number(formData.width) : undefined,
        height: formData.height ? Number(formData.height) : undefined,
        status: formData.status,
        isFeatured: formData.isFeatured,
      }

      const response = await fetch(
        isCreate ? '/api/admin/products' : `/api/admin/products/${editingProduct.id}`,
        {
          method: isCreate ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la sauvegarde')
      }

      setFormSuccess(isCreate ? 'Produit créé avec succès' : 'Produit mis à jour')
      await fetchProducts()
      setTimeout(() => {
        setIsModalOpen(false)
        setEditingProduct(null)
      }, 800)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(product: ProductData) {
    const confirmed = window.confirm(`Supprimer le produit "${product.name}" ?`)
    if (!confirmed) return

    setDeletingId(product.id)
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la suppression')
      }

      await fetchProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression')
    } finally {
      setDeletingId(null)
    }
  }

  function renderStatusBadge(status: ProductStatus) {
    const styles: Record<ProductStatus, string> = {
      DRAFT: 'bg-gray-100 text-gray-800',
      ACTIVE: 'bg-green-100 text-green-800',
      DISABLED: 'bg-red-100 text-red-800',
    }
    return <Badge className={styles[status]}>{STATUS_LABELS[status]}</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des produits</h1>
          <p className="text-gray-500">
            {total} produit{total > 1 ? 's' : ''} sur la plateforme
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-2" />
          Nouveau produit
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Rechercher par nom, slug ou description..."
            className="pl-10"
          />
        </div>

        <Select
          value={categoryFilter}
          onValueChange={(value) => {
            setCategoryFilter(value)
            setPage(1)
          }}
        >
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Toutes les catégories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les catégories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value)
            setPage(1)
          }}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="DRAFT">Brouillons</SelectItem>
            <SelectItem value="ACTIVE">Actifs</SelectItem>
            <SelectItem value="DISABLED">Désactivés</SelectItem>
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
                  <TableHead>Produit</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Prix</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="px-6 py-4 text-center text-gray-500">
                      Aucun produit trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-gray-400 shrink-0" />
                          <div>
                            <p className="font-medium text-gray-900">{product.name}</p>
                            <p className="text-xs text-gray-500">/{product.slug}</p>
                          </div>
                          {product.isFeatured && (
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {product.category?.name || '—'}
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {product.supplier?.companyName || '—'}
                      </TableCell>
                      <TableCell className="font-medium text-gray-900">
                        {formatCurrency(Number(product.supplierPrice), product.currency)}
                      </TableCell>
                      <TableCell>{renderStatusBadge(product.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => openEditModal(product)}
                            title="Modifier le produit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => handleDelete(product)}
                            disabled={deletingId === product.id}
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
                  ))
                )}
              </TableBody>
              <TableCaption>
                {loading ? 'Chargement...' : `${products.length} résultat(s) sur cette page`}
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
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {editingProduct ? 'Modifier le produit' : 'Créer un nouveau produit'}
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="name">Nom du produit *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  placeholder="ex: Support téléphone réglable"
                />
              </div>

              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => handleFormChange('slug', e.target.value)}
                  placeholder="support-telephone-reglable"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="supplier">Fournisseur *</Label>
                <Select
                  value={formData.supplierId}
                  onValueChange={(value) => handleFormChange('supplierId', value)}
                >
                  <SelectTrigger id="supplier">
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

              <div className="grid gap-2">
                <Label htmlFor="category">Catégorie *</Label>
                <Select
                  value={formData.categoryId}
                  onValueChange={(value) => handleFormChange('categoryId', value)}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Sélectionner une catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  placeholder="Décrivez le produit : matériaux, dimensions, usages..."
                  rows={4}
                />
              </div>

              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="shortDescription">Résumé</Label>
                <Textarea
                  id="shortDescription"
                  value={formData.shortDescription}
                  onChange={(e) => handleFormChange('shortDescription', e.target.value)}
                  placeholder="Résumé pour les listes (max 200 caractères)"
                  rows={2}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="supplierPrice">Prix fournisseur (MAD) *</Label>
                <Input
                  id="supplierPrice"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.supplierPrice}
                  onChange={(e) => handleFormChange('supplierPrice', e.target.value)}
                  placeholder="85.00"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="productionDays">Délai de production (jours) *</Label>
                <Input
                  id="productionDays"
                  type="number"
                  min="1"
                  max="60"
                  value={formData.productionDays}
                  onChange={(e) => handleFormChange('productionDays', e.target.value)}
                  placeholder="5"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="weight">Poids (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.weight}
                  onChange={(e) => handleFormChange('weight', e.target.value)}
                  placeholder="0.150"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="length">Longueur (cm)</Label>
                <Input
                  id="length"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.length}
                  onChange={(e) => handleFormChange('length', e.target.value)}
                  placeholder="15"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="width">Largeur (cm)</Label>
                <Input
                  id="width"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.width}
                  onChange={(e) => handleFormChange('width', e.target.value)}
                  placeholder="10"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="height">Hauteur (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.height}
                  onChange={(e) => handleFormChange('height', e.target.value)}
                  placeholder="5"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="status">Statut *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => handleFormChange('status', value as ProductStatus)}
                >
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Sélectionner un statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Brouillon</SelectItem>
                    <SelectItem value="ACTIVE">Actif</SelectItem>
                    <SelectItem value="DISABLED">Désactivé</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end gap-2 pb-2">
                <input
                  id="isFeatured"
                  type="checkbox"
                  checked={formData.isFeatured}
                  onChange={(e) => handleFormChange('isFeatured', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="isFeatured" className="font-normal">
                  Produit en vedette
                </Label>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={closeModal} disabled={saving}>
                Annuler
              </Button>
              <Button
                onClick={handleSave}
                disabled={
                  saving ||
                  !formData.name ||
                  !formData.slug ||
                  !formData.categoryId ||
                  !formData.supplierId ||
                  !formData.supplierPrice
                }
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Package className="h-4 w-4 mr-2" />
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
