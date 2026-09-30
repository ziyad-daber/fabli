'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Search, Filter, ChevronLeft, ChevronRight, Plus, Eye, Calculator } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/helpers'

const mockProducts = [
  {
    id: '1',
    name: 'Support téléphone réglable',
    category: 'Accessoires',
    supplier: 'Imprim3D Maroc',
    supplierPrice: 85,
    suggestedResellerPrice: 150,
    productionDays: 3,
    status: 'ACTIVE',
    image: null,
  },
  {
    id: '2',
    name: 'Boîtier Raspberry Pi 4',
    category: 'Électronique',
    supplier: 'TechPrint Casablanca',
    supplierPrice: 45,
    suggestedResellerPrice: 89,
    productionDays: 2,
    status: 'ACTIVE',
    image: null,
  },
  {
    id: '3',
    name: 'Pot de fleurs géométrique',
    category: 'Décoration',
    supplier: 'Design3D Rabat',
    supplierPrice: 35,
    suggestedResellerPrice: 75,
    productionDays: 4,
    status: 'ACTIVE',
    image: null,
  },
  {
    id: '4',
    name: 'Crochet mural design (lot de 4)',
    category: 'Organisation',
    supplier: 'Imprim3D Maroc',
    supplierPrice: 12,
    suggestedResellerPrice: 28,
    productionDays: 1,
    status: 'ACTIVE',
    image: null,
  },
  {
    id: '5',
    name: 'Figurine Articulée',
    category: 'Jouets',
    supplier: 'CreativePrint Tanger',
    supplierPrice: 120,
    suggestedResellerPrice: 220,
    productionDays: 7,
    status: 'ACTIVE',
    image: null,
  },
  {
    id: '6',
    name: 'Clé dynamométrique imprimée',
    category: 'Outils',
    supplier: 'ProPrint Fès',
    supplierPrice: 65,
    suggestedResellerPrice: 135,
    productionDays: 5,
    status: 'ACTIVE',
    image: null,
  },
]

export default function ResellerCatalogPage() {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [resellerPrices, setResellerPrices] = useState<Record<string, number>>({})

  const categories = ['all', 'Accessoires', 'Électronique', 'Décoration', 'Organisation', 'Jouets', 'Outils']
  const suppliers = ['all', 'Imprim3D Maroc', 'TechPrint Casablanca', 'Design3D Rabat', 'CreativePrint Tanger', 'ProPrint Fès']

  const filteredProducts = mockProducts.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter
    const matchesSupplier = supplierFilter === 'all' || p.supplier === supplierFilter
    return matchesSearch && matchesCategory && matchesSupplier
  })

  const calculateMargin = (supplierPrice: number, resellerPrice: number) => {
    const margin = resellerPrice - supplierPrice
    const marginPercent = ((margin / resellerPrice) * 100).toFixed(1)
    return { margin, marginPercent }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalogue produits</h1>
          <p className="text-gray-500">Sélectionnez des produits et définissez vos prix de vente</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Rechercher un produit, fournisseur..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Catégorie" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat === 'all' ? 'Toutes catégories' : cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Fournisseur" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((sup) => (
                    <SelectItem key={sup} value={sup}>
                      {sup === 'all' ? 'Tous fournisseurs' : sup}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Products Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredProducts.map((product) => {
          const resellerPrice = resellerPrices[product.id] || product.suggestedResellerPrice
          const { margin, marginPercent } = calculateMargin(product.supplierPrice, resellerPrice)

          return (
            <Card key={product.id} className="flex flex-col">
              <div className="aspect-square bg-gray-100 flex items-center justify-center relative overflow-hidden">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-gray-400 text-center p-4">
                    <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <Badge variant={product.status === 'ACTIVE' ? 'default' : 'secondary'} className="absolute top-2 right-2">
                  {product.status}
                </Badge>
              </div>

              <CardContent className="flex-1 flex flex-col p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-medium text-gray-900 line-clamp-2 flex-1">{product.name}</h3>
                </div>
                <p className="text-xs text-gray-500 mb-2">{product.category} • {product.supplier}</p>

                <div className="space-y-2 mb-3 border-t border-b border-gray-100 py-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-gray-500">Prix fournisseur</p>
                      <p className="font-semibold">{formatCurrency(product.supplierPrice)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Prix suggéré</p>
                      <p className="font-semibold text-primary">{formatCurrency(product.suggestedResellerPrice)}</p>
                    </div>
                  </div>
                </div>

                {/* Reseller Price Input */}
                <div className="space-y-2 mb-3">
                  <label className="block text-sm font-medium text-gray-700">Votre prix de vente (MAD)</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min={product.supplierPrice + 1}
                      value={resellerPrice}
                      onChange={(e) => setResellerPrices({ ...resellerPrices, [product.id]: parseFloat(e.target.value) || product.suggestedResellerPrice })}
                      className="flex-1"
                    />
                    <span className="flex items-center text-sm text-gray-500">MAD</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-green-600 font-medium">Marge: {formatCurrency(margin)} ({marginPercent}%)</span>
                    <span className="text-gray-500">{product.productionDays}j fabrication</span>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex gap-2 p-4 pt-0">
                <Button variant="outline" size="sm" className="flex-1">
                  <Eye className="h-3 w-3 mr-1" />
                  Détails
                </Button>
                <Button size="sm" className="flex-1" disabled={resellerPrice <= product.supplierPrice}>
                  <Plus className="h-3 w-3 mr-1" />
                  Commander
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>

      {filteredProducts.length === 0 && (
        <Card className="text-center py-12">
          <p className="text-gray-500">Aucun produit ne correspond à vos critères</p>
        </Card>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Affichage de {filteredProducts.length} produit(s)
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" disabled>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}