'use client'

import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { cn } from '@/lib/utils/helpers'
import {
  Users,
  Package,
  ShoppingBag,
  Truck,
  CreditCard,
  FileText,
  Settings,
  Shield,
  BarChart3,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'

const stats = [
  { name: 'Utilisateurs totaux', value: '156', change: '+12 ce mois', icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
  { name: 'Fournisseurs actifs', value: '23', change: '+3 en attente', icon: Shield, color: 'text-green-600', bg: 'bg-green-100' },
  { name: 'Produits publiés', value: '187', change: '+8 cette semaine', icon: Package, color: 'text-purple-600', bg: 'bg-purple-100' },
  { name: 'Commandes ce mois', value: '342', change: '+15% vs mois dernier', icon: ShoppingBag, color: 'text-orange-600', bg: 'bg-orange-100' },
]

const recentActivity = [
  { id: '1', type: 'user_registered', message: 'Nouveau fournisseur inscrit: Imprim3D Agadir', time: 'Il y a 10 min', icon: Shield, color: 'text-green-600 bg-green-100' },
  { id: '2', type: 'order_created', message: 'Commande #FAB-2026-000145 créée par ElectroShop', time: 'Il y a 25 min', icon: ShoppingBag, color: 'text-blue-600 bg-blue-100' },
  { id: '3', type: 'shipment_created', message: 'Expédition AMEEX créée: SUIVI-MA-123456', time: 'Il y a 1h', icon: Truck, color: 'text-purple-600 bg-purple-100' },
  { id: '4', type: 'product_pending', message: 'Produit en attente de modération: "Support mural"', time: 'Il y a 2h', icon: Package, color: 'text-yellow-600 bg-yellow-100' },
  { id: '5', type: 'settlement_due', message: 'Règlement fournisseur dû: TechPrint Casablanca - 12,450 MAD', time: 'Il y a 3h', icon: CreditCard, color: 'text-red-600 bg-red-100' },
]

const alerts = [
  { message: '3 fournisseurs en attente de validation', action: 'Voir', href: '/dashboard/admin/suppliers?status=pending' },
  { message: '5 produits signalés pour modération', action: 'Modérer', href: '/dashboard/admin/products?status=pending' },
  { message: '2 expéditions AMEEX en erreur', action: 'Corriger', href: '/dashboard/admin/shipments?status=error' },
]

export default function AdminDashboardPage() {
  const { data: session } = useSession()

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord administrateur</h1>
          <p className="text-gray-500">Vue d'ensemble de la plateforme Fabli</p>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <span className="text-sm text-yellow-800">{alert.message}</span>
              <Link href={alert.href} className="text-sm font-medium text-yellow-700 hover:underline">
                {alert.action}
              </Link>
            </div>
          ))}
        </div>
      )}

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

      {/* Quick actions & Recent activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Actions rapides</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/dashboard/admin/users/new">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Users className="h-4 w-4" />
                  Ajouter un utilisateur
                </Button>
              </Link>
              <Link href="/dashboard/admin/suppliers">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Shield className="h-4 w-4" />
                  Valider fournisseurs
                </Button>
              </Link>
              <Link href="/dashboard/admin/products">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Package className="h-4 w-4" />
                  Modérer produits
                </Button>
              </Link>
              <Link href="/dashboard/admin/orders">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  Gérer commandes
                </Button>
              </Link>
              <Link href="/dashboard/admin/shipments">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Truck className="h-4 w-4" />
                  Expéditions AMEEX
                </Button>
              </Link>
              <Link href="/dashboard/admin/settlements">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <FileText className="h-4 w-4" />
                  Règlements fournisseurs
                </Button>
              </Link>
              <Link href="/dashboard/admin/ameex">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Settings className="h-4 w-4" />
                  Config AMEEX
                </Button>
              </Link>
              <Link href="/dashboard/admin/analytics">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Analytics
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                Alertes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-medium text-red-800">2 expéditions en erreur</p>
                <p className="text-xs text-red-600 mt-1">Vérifier l'intégration AMEEX</p>
                <Link href="/dashboard/admin/shipments?status=error" className="text-xs text-red-700 hover:underline block mt-2">
                  Voir détails
                </Link>
              </div>
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm font-medium text-yellow-800">Règlements en retard</p>
                <p className="text-xs text-yellow-600 mt-1">3 fournisseurs attendent paiement</p>
                <Link href="/dashboard/admin/settlements?status=overdue" className="text-xs text-yellow-700 hover:underline block mt-2">
                  Voir détails
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Activité récente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-4 p-3 hover:bg-gray-50 rounded-lg">
                    <div className={cn('p-2 rounded-full', activity.color)}>
                      <activity.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{activity.message}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-center pt-4 border-t border-gray-100">
                <Link href="/dashboard/admin/activity" className="text-primary text-sm hover:underline">
                  Voir toute l'activité
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}