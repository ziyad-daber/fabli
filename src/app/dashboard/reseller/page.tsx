'use client'

import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  Package,
  ShoppingBag,
  Truck,
  CreditCard,
  Search,
} from 'lucide-react'

const stats = [
  { name: 'Produits favoris', value: '8', change: '+2 ce mois', icon: Package, color: 'text-blue-600', bg: 'bg-blue-100' },
  { name: 'Commandes en cours', value: '3', change: '1 en fabrication', icon: ShoppingBag, color: 'text-orange-600', bg: 'bg-orange-100' },
  { name: 'Expéditions à suivre', value: '2', change: '1 livrée aujourd\'hui', icon: Truck, color: 'text-green-600', bg: 'bg-green-100' },
  { name: 'Marge estimée', value: '12,500 MAD', change: '+3,200 MAD ce mois', icon: CreditCard, color: 'text-purple-600', bg: 'bg-purple-100' },
]

export default function ResellerDashboardPage() {
  const { data: session } = useSession()

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bonjour, {session?.user?.email}</h1>
          <p className="text-gray-500">Suivez votre activité commerciale</p>
        </div>
        <Link href="/dashboard/reseller/catalog">
          <Button>
            <Search className="h-4 w-4 mr-2" />
            Parcourir le catalogue
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{stat.name}</CardTitle>
              <stat.icon className={stat.color} aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <p className="text-xs text-gray-500 mt-1">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Actions rapides</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/dashboard/reseller/catalog">
              <Button variant="outline" className="w-full justify-start gap-2">
                <Package className="h-4 w-4" />
                Découvrir le catalogue
              </Button>
            </Link>
            <Link href="/dashboard/reseller/orders">
              <Button variant="outline" className="w-full justify-start gap-2">
                <ShoppingBag className="h-4 w-4" />
                Mes commandes
              </Button>
            </Link>
            <Link href="/dashboard/reseller/shipments">
              <Button variant="outline" className="w-full justify-start gap-2">
                <Truck className="h-4 w-4" />
                Suivre les expéditions
              </Button>
            </Link>
            <Link href="/dashboard/reseller/commissions">
              <Button variant="outline" className="w-full justify-start gap-2">
                <CreditCard className="h-4 w-4" />
                Voir mes marges
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
              <Link href="/dashboard/reseller/orders" className="text-primary text-sm hover:underline block text-center">
                Voir toutes les commandes
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}