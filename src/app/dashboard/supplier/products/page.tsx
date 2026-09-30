'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Eye,
  Package,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

const mockProducts = [
  {
    id: '1',
    name: 'Support téléphone réglable',
    category: 'Accessoires',
    supplierPrice: 85,
    resellerPrice: 150,
    status: 'ACTIVE',
    productionDays: 3,
    createdAt: '2026-01-15',
    ordersCount: 24,
  },
  {
    id: '2',
    name: 'Boîtier Raspberry Pi 4',
    category: 'Électronique',
    supplierPrice: 45,
    resellerPrice: 89,
    status: 'ACTIVE',
    productionDays: 2,
    createdAt: '2026-01-10',
    ordersCount: 18,
  },
  {
    id: '3',
    name: 'Pot de fleurs géométrique',
    category: 'Décoration',
    supplierPrice: 35,
    resellerPrice: 75,
    status: 'DRAFT',
    productionDays: 4,
    createdAt: '2026-01-20',
    ordersCount: 0,
  },
  {
    id: '4',
    name: 'Crochet mural design',
    category: 'Organisation',
    supplierPrice: 12,
    resellerPrice: 28,
    status: 'DISABLED',
    productionDays: 1,
    createdAt: '2026-01-05',
    ordersCount: 5,
  },
]

const statusLabels: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Actif', color: 'bg-green-100 text-green-800' },
  DRAFT: { label: 'Brouillon', color: 'bg-yellow-100 text-yellow-800' },
  DISABLED: { label: 'Désactivé', color: 'bg-gray-100 text-gray-800' },
}

export default function SupplierProductsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)

  const filteredProducts = mockProducts.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes produits</h1>
          <p className="text-gray-500">Gérez votre catalogue de produits imprimés en 3D</p>
        </div>
        <Link href="/dashboard/supplier/products/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau produit
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Rechercher un produit..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="status-filter" className="mb-0">Statut:</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
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
          </form>
        </CardContent>
      </Card>

      {/* Products table */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des produits ({filteredProducts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">Aucun produit</h3>
              <p className="text-gray-500 mt-1">Commencez par créer votre premier produit</p>
              <Link href="/dashboard/supplier/products/new" className="mt-4 inline-block">
                <Button>Créer un produit</Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full" role="table">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-medium text-gray-500">Produit</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-500 hidden md:table-cell">Catégorie</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-500 hidden lg:table-cell">Prix fournisseur</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-500 hidden lg:table-cell">Prix revendeur suggéré</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-500">Statut</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-500 hidden md:table-cell">Commandes</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => (
                      <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-4 px-4">
                          <div>
                            <p className="font-medium text-gray-900">{product.name}</p>
                            <p className="text-sm text-gray-500">{product.productionDays}j fabrication</p>
                          </div>
                        </td>
                        <td className="py-4 px-4 hidden md:table-cell">{product.category}</td>
                        <td className="py-4 px-4 hidden lg:table-cell font-medium">{product.supplierPrice} MAD</td>
                        <td className="py-4 px-4 hidden lg:table-cell text-gray-500">{product.resellerPrice} MAD</td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusLabels[product.status]?.color}`}>
                            {statusLabels[product.status]?.label}
                          </span>
                        </td>
                        <td className="py-4 px-4 hidden md:table-cell text-gray-500">{product.ordersCount}</td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/dashboard/supplier/products/${product.id}`} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg" aria-label="Voir">
                              <Eye className="h-4 w-4" />
                            </Link>
                            <Link href={`/dashboard/supplier/products/${product.id}/edit`} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg" aria-label="Modifier">
                              <Edit className="h-4 w-4" />
                            </Link>
                            <button className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg" aria-label="Supprimer">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-gray-500">
                  Page {page} sur 1
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}