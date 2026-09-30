'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Package,
  ShoppingBag,
  Truck,
  CreditCard,
  Search,
  Loader2,
  AlertTriangle,
  Plus,
  Clock,
  Wallet,
  TrendingUp,
} from 'lucide-react'
import { OrderStatusBadge } from '@/components/status-badge'
import { formatCurrency, formatDate } from '@/lib/utils/helpers'
import type { OrderData } from '@/components/reseller/order-types'

interface OverviewPayload {
  summary: {
    revenue: number
    shipping: number
    commission: number
    grossMargin: number
    netMargin: number
    codExpected: number
    deliveredRevenue: number
    deliveredNetMargin: number
  }
  counts: { total: number; delivered: number; inProgress: number }
}

/** Statuts où la commande est en attente d'expédition et mérite un suivi. */
const A_EXPEDIER: string[] = ['READY_TO_SHIP', 'SHIPMENT_CREATED']

export default function ResellerDashboardPage() {
  const { data: session } = useSession()

  const [overview, setOverview] = useState<OverviewPayload | null>(null)
  const [recentOrders, setRecentOrders] = useState<OrderData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOverview = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      // Les deux appels sont indépendants : on les lance en parallèle et on
      // n'échoue que si l'un des deux échoue.
      const [commissionsResponse, ordersResponse] = await Promise.all([
        fetch('/api/reseller/commissions', { signal }),
        fetch('/api/orders?page=1&limit=5', { signal }),
      ])

      if (!commissionsResponse.ok) {
        const data = await commissionsResponse.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur lors du chargement de vos statistiques')
      }
      if (!ordersResponse.ok) {
        const data = await ordersResponse.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur lors du chargement des commandes')
      }

      const commissions = await commissionsResponse.json()
      const orders = await ordersResponse.json()

      setOverview({ summary: commissions.summary, counts: commissions.counts })
      setRecentOrders(orders.orders || [])
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchOverview(controller.signal)
    return () => controller.abort()
  }, [fetchOverview])

  const readyToShip = recentOrders.filter((order) => A_EXPEDIER.includes(order.status))

  const stats = overview
    ? [
        {
          name: 'Chiffre d\'affaires',
          value: formatCurrency(overview.summary.revenue),
          change: `+ ${formatCurrency(overview.summary.shipping)} de livraison`,
          icon: TrendingUp,
          color: 'text-blue-600',
          bg: 'bg-blue-100',
        },
        {
          name: 'Commandes',
          value: String(overview.counts.total),
          change: `${overview.counts.inProgress} en cours · ${overview.counts.delivered} livrée(s)`,
          icon: ShoppingBag,
          color: 'text-orange-600',
          bg: 'bg-orange-100',
        },
        {
          name: 'Marge nette cumulée',
          value: formatCurrency(overview.summary.netMargin),
          change: `Marge brute : ${formatCurrency(overview.summary.grossMargin)}`,
          icon: CreditCard,
          color: 'text-purple-600',
          bg: 'bg-purple-100',
        },
        {
          name: 'COD attendu',
          value: formatCurrency(overview.summary.codExpected),
          change: `Commissions plateforme : ${formatCurrency(overview.summary.commission)}`,
          icon: Wallet,
          color: 'text-green-600',
          bg: 'bg-green-100',
        },
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Bonjour, {session?.user?.email}
          </h1>
          <p className="text-gray-500">Suivez votre activité commerciale</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/reseller/cart">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Créer une commande
            </Button>
          </Link>
          <Link href="/dashboard/reseller/catalog">
            <Button variant="outline">
              <Search className="h-4 w-4 mr-2" />
              Parcourir le catalogue
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* KPI */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {loading && stats.length === 0
          ? Array.from({ length: 4 }, (_, i) => (
              <Card key={`skeleton-${i}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-400">Chargement…</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-24 rounded bg-gray-100 animate-pulse" />
                </CardContent>
              </Card>
            ))
          : stats.map((stat) => (
              <Card key={stat.name}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500">{stat.name}</CardTitle>
                  <span className={`rounded p-2 ${stat.bg}`}>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} aria-hidden="true" />
                  </span>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                  <p className="text-xs text-gray-500 mt-1">{stat.change}</p>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Commandes à expédier */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Truck className="h-5 w-5 text-gray-400" />
              À expédier
            </CardTitle>
            <CardDescription>
              Commandes prêtes à partir ou déjà remises au transporteur
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : readyToShip.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                Aucune commande en attente d\'expédition
              </p>
            ) : (
              <ul className="space-y-3">
                {readyToShip.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/dashboard/reseller/orders/${order.id}`}
                      className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-gray-900">{order.orderNumber}</span>
                        <OrderStatusBadge status={order.status} />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {order.supplier?.companyName ?? '—'} ·{' '}
                        {formatDate(order.createdAt)} ·{' '}
                        {formatCurrency(Number(order.codAmount), order.currency)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Commandes récentes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-gray-400" />
              Commandes récentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : recentOrders.length === 0 ? (
              <>
                <p className="text-gray-500 text-center py-8">Aucune commande récente</p>
                <Link
                  href="/dashboard/reseller/catalog"
                  className="text-primary text-sm hover:underline block text-center"
                >
                  Découvrir le catalogue
                </Link>
              </>
            ) : (
              <ul className="space-y-3">
                {recentOrders.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/dashboard/reseller/orders/${order.id}`}
                      className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-gray-900">{order.orderNumber}</span>
                        <OrderStatusBadge status={order.status} />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {order.customerName} · {order.customerCity} ·{' '}
                        {formatCurrency(Number(order.codAmount), order.currency)}
                      </p>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href="/dashboard/reseller/orders"
                    className="text-primary text-sm hover:underline block text-center pt-2"
                  >
                    Voir toutes les commandes
                  </Link>
                </li>
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions rapides */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5 text-gray-400" />
            Actions rapides
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/dashboard/reseller/catalog">
            <Button variant="outline" className="w-full justify-start gap-2">
              <Search className="h-4 w-4" />
              Découvrir le catalogue
            </Button>
          </Link>
          <Link href="/dashboard/reseller/cart">
            <Button variant="outline" className="w-full justify-start gap-2">
              <ShoppingBag className="h-4 w-4" />
              Finaliser une commande
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

      {/* Bandeau d'information marge */}
      {overview && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Badge variant="secondary">Marge</Badge>
              <span>
                La marge brute ({formatCurrency(overview.summary.grossMargin)}) est calculée avant
                commission plateforme ; la marge nette (
                {formatCurrency(overview.summary.netMargin)}) est ce que vous conservez après la
                commission de {formatCurrency(overview.summary.commission)}.
              </span>
            </div>
            <Link href="/dashboard/reseller/commissions" className="text-primary hover:underline">
              Détail des commissions
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
