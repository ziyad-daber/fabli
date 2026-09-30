'use client'

import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { cn } from '@/lib/utils/helpers'
import {
  Package,
  ShoppingBag,
  Truck,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'

const stats = [
  { name: 'Produits actifs', value: '12', change: '+3 ce mois', icon: Package, color: 'text-blue-600', bg: 'bg-blue-100' },
  { name: 'Commandes en cours', value: '5', change: '2 en fabrication', icon: ShoppingBag, color: 'text-orange-600', bg: 'bg-orange-100' },
  { name: 'Expéditions en transit', value: '3', change: '1 livrée aujourd\'hui', icon: Truck, color: 'text-green-600', bg: 'bg-green-100' },
  { name: 'Commissions dues', value: '2,450 MAD', change: '+450 MAD ce mois', icon: CreditCard, color: 'text-purple-600', bg: 'bg-purple-100' },
]

export default function SupplierDashboardPage() {
  const { data: session } = useSession()

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bonjour, {session?.user?.email}</h1>
          <p className="text-gray-500">Voici un aperçu de votre activité</p>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/supplier/products/new">
            <Button>Nouveau produit</Button>
          </Link>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{stat.name}</CardTitle>
              <stat.icon className={cn('h-4 w-4', stat.color)} aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <p className="text-xs text-gray-500 mt-1">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Actions rapides</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/dashboard/supplier/products/new">
              <Button variant="outline" className="w-full justify-start gap-2">
                <Package className="h-4 w-4" />
                Ajouter un produit
              </Button>
            </Link>
            <Link href="/dashboard/supplier/orders">
              <Button variant="outline" className="w-full justify-start gap-2">
                <ShoppingBag className="h-4 w-4" />
                Voir les commandes
              </Button>
            </Link>
            <Link href="/dashboard/supplier/shipments">
              <Button variant="outline" className="w-full justify-start gap-2">
                <Truck className="h-4 w-4" />
                Gérer les expéditions
              </Button>
            </Link>
            <Link href="/dashboard/supplier/settlements">
              <Button variant="outline" className="w-full justify-start gap-2">
                <CreditCard className="h-4 w-4" />
                Voir les règlements
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Commandes récentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-gray-500 text-center py-8">Aucune commande récente</p>
              <Link href="/dashboard/supplier/orders" className="text-primary text-sm hover:underline block text-center">
                Voir toutes les commandes
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}