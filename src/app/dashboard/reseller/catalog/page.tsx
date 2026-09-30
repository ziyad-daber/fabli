'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Search,
  ShoppingCart,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Package,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils/helpers'
import { CartProvider, useCart } from '@/components/reseller/cart-context'

interface CatalogVariant {
  id: string
  name: string
  value: string
  additionalPrice: number
  stock: number
}

interface CatalogProduct {
  id: string
  name: string
  slug: string
  shortDescription: string | null
  category: { id: string; name: string; slug: string } | null
  supplier: { id: string; companyName: string; city: string; isVerified: boolean }
  image: string | null
  supplierPrice: number
  currency: string
  productionDays: number
  weight: number | null
  variants: CatalogVariant[]
  pricing: {
    suggestedResellerPrice: number
    resellerPrice: number
    commissionRate: number
    commissionAmount: number
    grossMargin: number
    netMargin: number
    grossMarginPercent: number
  }
}

interface CatalogFilters {
  categories: { id: string; name: string; slug: string; _count: { products: number } }[]
  suppliers: { id: string; companyName: string; city: string; _count: { products: number } }[]
  priceRange: { min: number; max: number }
}

const SORT_OPTIONS = [
  { value: 'recent', label: 'Plus récents' },
  { value: 'price_asc', label: 'Prix croissant' },
  { value: 'price_desc', label: 'Prix décroissant' },
  { value: 'name', label: 'Nom (A → Z)' },
]

const LIMIT = 12

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function CatalogContent() {
  const { addItem, count, items } = useCart()

  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [filters, setFilters] = useState<CatalogFilters | null>(null)
  const [commissionRate, setCommissionRate] = useState(0.1)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [supplierId, setSupplierId] = useState('all')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState('recent')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  /** Prix de revente saisi par carte, par produit. */
  const [prices, setPrices] = useState<Record<string, number>>({})
  /** Variante choisie par carte, par produit. `undefined` = sans variante. */
  const [variants, setVariants] = useState<Record<string, string | undefined>>({})

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch('/api/catalog/filters', { signal: controller.signal })
        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || 'Erreur lors du chargement des filtres')
        }
        const data: CatalogFilters = await response.json()
        setFilters(data)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Une erreur est survenue')
      }
    }
    load()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(LIMIT), sort })
        if (debouncedSearch) params.set('search', debouncedSearch)
        if (categoryId !== 'all') params.set('categoryId', categoryId)
        if (supplierId !== 'all') params.set('supplierId', supplierId)
        if (minPrice) params.set('minPrice', minPrice)
        if (maxPrice) params.set('maxPrice', maxPrice)

        const response = await fetch(`/api/catalog?${params.toString()}`, { signal: controller.signal })
        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || 'Erreur lors du chargement du catalogue')
        }
        const data = await response.json()
        setProducts(data.products || [])
        setTotal(data.pagination?.total || 0)
        setTotalPages(data.pagination?.totalPages || 0)
        if (typeof data.commissionRate === 'number') setCommissionRate(data.commissionRate)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Une erreur est survenue')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [page, sort, debouncedSearch, categoryId, supplierId, minPrice, maxPrice])

  /**
   * Le serveur fige le prix fournisseur en y ajoutant le supplément de variante :
   * on reproduit cette base pour estimer la marge en direct avant la commande.
   */
  const pricingFor = useCallback(
    (product: CatalogProduct) => {
      const variantId = variants[product.id]
      const variant = product.variants.find((v) => v.id === variantId)
      const effectiveSupplierPrice = round2(product.supplierPrice + (variant?.additionalPrice ?? 0))
      const resellerPrice = prices[product.id] ?? product.pricing.suggestedResellerPrice
      const commissionAmount = round2(effectiveSupplierPrice * commissionRate)
      const grossMargin = round2(resellerPrice - effectiveSupplierPrice)
      const netMargin = round2(grossMargin - commissionAmount)
      return { resellerPrice, effectiveSupplierPrice, commissionAmount, grossMargin, netMargin }
    },
    [prices, variants, commissionRate]
  )

  const cartSupplier = useMemo(
    () => (items.length > 0 ? items[0].supplierName : null),
    [items]
  )

  function handleAddToCart(product: CatalogProduct) {
    const pricing = pricingFor(product)
    if (pricing.netMargin < 0) {
      setNotice('Marge nette négative : augmentez votre prix de vente avant d\'ajouter au panier.')
      return
    }
    const variantId = variants[product.id]
    const variant = product.variants.find((v) => v.id === variantId)

    if (cartSupplier && cartSupplier !== product.supplier.companyName) {
      setNotice(
        `Une commande ne porte qu'un seul fournisseur : votre panier contient déjà des articles de « ${cartSupplier} ». Videz le panier avant d'ajouter un produit de « ${product.supplier.companyName} ».`
      )
      return
    }

    addItem({
      productId: product.id,
      name: product.name,
      supplierId: product.supplier.id,
      supplierName: product.supplier.companyName,
      supplierPrice: product.supplierPrice,
      variantId: variant?.id,
      variantLabel: variant ? `${variant.name} : ${variant.value}` : undefined,
      quantity: 1,
      resellerPrice: pricing.resellerPrice,
      image: product.image,
    })
    setNotice(
      variant
        ? `« ${product.name} » (${variant.name} : ${variant.value}) ajouté au panier.`
        : `« ${product.name} » ajouté au panier.`
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalogue produits</h1>
          <p className="text-gray-500">
            Sélectionnez des produits et définissez vos prix de vente — commission plateforme :{' '}
            {(commissionRate * 100).toFixed(0)} %
          </p>
        </div>
        <Link href="/dashboard/reseller/cart">
          <Button variant="outline">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Panier ({count})
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Rechercher un produit..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                aria-label="Rechercher un produit"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Select
                value={categoryId}
                onValueChange={(value) => {
                  setCategoryId(value)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[180px]" aria-label="Catégorie">
                  <SelectValue placeholder="Catégorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes catégories</SelectItem>
                  {(filters?.categories ?? []).map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name} ({category._count.products})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={supplierId}
                onValueChange={(value) => {
                  setSupplierId(value)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[220px]" aria-label="Fournisseur">
                  <SelectValue placeholder="Fournisseur" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous fournisseurs</SelectItem>
                  {(filters?.suppliers ?? []).map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.companyName} ({supplier.city})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1 w-28">
                <Label htmlFor="minPrice">Prix min.</Label>
                <Input
                  id="minPrice"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={filters?.priceRange.min?.toString() ?? '0'}
                  value={minPrice}
                  onChange={(e) => {
                    setMinPrice(e.target.value)
                    setPage(1)
                  }}
                />
              </div>
              <div className="grid gap-1 w-28">
                <Label htmlFor="maxPrice">Prix max.</Label>
                <Input
                  id="maxPrice"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={filters?.priceRange.max?.toString() ?? '0'}
                  value={maxPrice}
                  onChange={(e) => {
                    setMaxPrice(e.target.value)
                    setPage(1)
                  }}
                />
              </div>
              <div className="grid gap-1 w-[180px]">
                <Label htmlFor="sort">Tri</Label>
                <Select value={sort} onValueChange={(value) => { setSort(value); setPage(1) }}>
                  <SelectTrigger id="sort">
                    <SelectValue placeholder="Trier" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-blue-800">
          <ShoppingCart className="h-4 w-4 shrink-0" />
          <span className="text-sm flex-1">{notice}</span>
          <button className="text-xs underline" onClick={() => setNotice(null)}>
            Fermer
          </button>
        </div>
      )}

      {/* Products Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : products.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-gray-500">Aucun produit ne correspond à vos critères</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => {
            const pricing = pricingFor(product)
            const negativeNet = pricing.netMargin < 0
            const selectedVariant = variants[product.id]

            return (
              <Card key={product.id} className="flex flex-col">
                <div className="aspect-square bg-gray-100 flex items-center justify-center relative overflow-hidden">
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-gray-400 text-center p-4">
                      <Package className="mx-auto h-12 w-12" aria-hidden="true" />
                    </div>
                  )}
                  {product.supplier.isVerified && (
                    <Badge className="absolute top-2 right-2 bg-blue-100 text-blue-800">Vérifié</Badge>
                  )}
                </div>

                <CardContent className="flex-1 flex flex-col p-4">
                  <h3 className="font-medium text-gray-900 line-clamp-2 flex-1">{product.name}</h3>
                  <p className="text-xs text-gray-500 mt-1 mb-2">
                    {product.category?.name ?? 'Sans catégorie'} • {product.supplier.companyName} •{' '}
                    {product.supplier.city}
                  </p>

                  <div className="space-y-1 mb-3 border-t border-b border-gray-100 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Prix fournisseur</span>
                      <span className="font-semibold">
                        {formatCurrency(product.supplierPrice, product.currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Prix suggéré</span>
                      <span className="font-semibold text-primary">
                        {formatCurrency(product.pricing.suggestedResellerPrice, product.currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Fabrication</span>
                      <span className="text-gray-600">{product.productionDays} j</span>
                    </div>
                  </div>

                  {product.variants.length > 0 && (
                    <div className="grid gap-1 mb-3">
                      <Label htmlFor={`variant-${product.id}`} className="text-xs">
                        Variante
                      </Label>
                      <Select
                        value={selectedVariant ?? 'none'}
                        onValueChange={(value) =>
                          setVariants((prev) => ({
                            ...prev,
                            [product.id]: value === 'none' ? undefined : value,
                          }))
                        }
                      >
                        <SelectTrigger id={`variant-${product.id}`} className="h-9">
                          <SelectValue placeholder="Sans variante" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sans variante</SelectItem>
                          {product.variants.map((variant) => (
                            <SelectItem key={variant.id} value={variant.id}>
                              {variant.name} : {variant.value}
                              {variant.additionalPrice > 0
                                ? ` (+${formatCurrency(variant.additionalPrice, product.currency)})`
                                : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2 mb-3">
                    <Label htmlFor={`price-${product.id}`} className="text-sm">
                      Votre prix de vente (MAD)
                    </Label>
                    <Input
                      id={`price-${product.id}`}
                      type="number"
                      step="0.01"
                      min={0}
                      value={pricing.resellerPrice}
                      onChange={(e) =>
                        setPrices((prev) => ({
                          ...prev,
                          [product.id]: Number(e.target.value),
                        }))
                      }
                    />
                    <div className="rounded-md bg-gray-50 p-2 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Marge brute</span>
                        <span className="font-medium">
                          {formatCurrency(pricing.grossMargin, product.currency)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Commission plateforme</span>
                        <span className="font-medium text-red-600">
                          − {formatCurrency(pricing.commissionAmount, product.currency)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-gray-200 pt-1">
                        <span className="text-gray-500">Marge nette</span>
                        <span className={`font-semibold ${negativeNet ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(pricing.netMargin, product.currency)}
                        </span>
                      </div>
                    </div>
                    {negativeNet && (
                      <p className="text-xs text-red-600 flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        Marge nette négative : ce prix de vente ne vous laisse rien après commission.
                      </p>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="p-4 pt-0">
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={negativeNet}
                    onClick={() => handleAddToCart(product)}
                  >
                    <ShoppingCart className="h-3 w-3 mr-1" />
                    Ajouter au panier
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      {/* Variants table — rend les suppléments de variante lisibles d'un coup d'œil */}
      {products.some((product) => product.variants.length > 0) && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="font-semibold text-gray-900 mb-3">Variantes disponibles</h2>
            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produit</TableHead>
                    <TableHead>Variante</TableHead>
                    <TableHead className="text-right">Supplément</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.flatMap((product) =>
                    product.variants.map((variant) => (
                      <TableRow key={`${product.id}-${variant.id}`}>
                        <TableCell className="text-gray-900">{product.name}</TableCell>
                        <TableCell>
                          {variant.name} : {variant.value}
                        </TableCell>
                        <TableCell className="text-right">
                          {variant.additionalPrice > 0
                            ? formatCurrency(variant.additionalPrice, product.currency)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right">{variant.stock}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{total} produit(s) dans le catalogue</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
            Précédent
          </Button>
          <span className="flex items-center text-sm text-gray-600">
            Page {page} / {Math.max(1, totalPages)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
          >
            Suivant
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function ResellerCatalogPage() {
  // Le panier vit dans un provider local à la page : l'agent qui édite le
  // layout n'est pas modifié. Conséquence : l'état n'est pas partagé entre deux
  // pages ouvertes simultanément, seul le localStorage l'est.
  return (
    <CartProvider>
      <CatalogContent />
    </CartProvider>
  )
}
