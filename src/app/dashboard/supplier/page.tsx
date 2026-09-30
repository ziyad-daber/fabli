'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
  TableCaption,
} from '@/components/ui'
import { Skeleton } from '@/components/ui/skeleton'
import { OrderStatusBadge } from '@/components/status-badge'
import { cn, formatCurrency, formatDate } from '@/lib/utils/helpers'
import {
  Package,
  ShoppingBag,
  Truck,
  CreditCard,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Factory,
  PackageCheck,
  Banknote,
} from 'lucide-react'

type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'IN_PRODUCTION'
  | 'READY_TO_SHIP'
  | 'SHIPMENT_CREATED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'DELIVERY_FAILED'
  | 'RETURNED'
  | 'SHIPMENT_ERROR'

interface OrderSummary {
  id: string
  orderNumber: string
  status: OrderStatus
  subtotal: string | number
  shippingFee: string | number
  commissionAmount: string | number
  currency: string
  customerName: string
  customerCity: string | null
  createdAt: string
  deliveredAt: string | null
  reseller: { id: string; companyName: string } | null
  shipments?: { id: string; trackingCode: string | null; status: string }[]
}

interface CountResponse {
  pagination: { total: number }
}

/** Statuts comptés par simple total : inutile de récupérer les lignes. */
const COUNTED_STATUSES: OrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'IN_PRODUCTION',
  'SHIPMENT_CREATED',
  'IN_TRANSIT',
]

function isInCurrentMonth(value: string | null): boolean {
  if (!value) return false
  const date = new Date(value)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  )
}

export default function SupplierDashboardPage() {
  const { data: session } = useSession()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [readyOrders, setReadyOrders] = useState<OrderSummary[]>([])
  const [readyTotal, setReadyTotal] = useState(0)
  const [monthDelivered, setMonthDelivered] = useState<OrderSummary[]>([])

  const fetchOverview = useCallback(async (signal: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      // Un seul tour de requêtes : l'API n'expose pas de compteurs agrégés et
      // le périmètre fournisseur est déjà appliqué côté serveur.
      const countPromises = COUNTED_STATUSES.map(async (status) => {
        const res = await fetch(`/api/orders?status=${status}&limit=1`, { signal })
        if (!res.ok) return [status, 0] as const
        const data: CountResponse = await res.json()
        return [status, data.pagination?.total ?? 0] as const
      })

      const [recentRes, readyRes, deliveredRes, ...countResults] = await Promise.all([
        fetch('/api/orders?limit=10', { signal }),
        fetch('/api/orders?status=READY_TO_SHIP&limit=50', { signal }),
        fetch('/api/orders?status=DELIVERED&limit=100', { signal }),
        ...countPromises,
      ])

      for (const res of [recentRes, readyRes, deliveredRes]) {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Erreur lors du chargement du tableau de bord')
        }
      }

      const recent = (await recentRes.json()) as { orders: OrderSummary[] }
      const ready = (await readyRes.json()) as {
        orders: OrderSummary[]
        pagination: { total: number }
      }
      const delivered = (await deliveredRes.json()) as { orders: OrderSummary[] }

      setRecentOrders(recent.orders || [])
      setReadyOrders(ready.orders || [])
      // Le compteur vient du serveur : la liste est plafonnée à 50 lignes.
      setReadyTotal(ready.pagination?.total ?? 0)
      setMonthDelivered(
        (delivered.orders || []).filter((order) => isInCurrentMonth(order.deliveredAt))
      )
      const nextCounts: Record<string, number> = {}
      for (const [status, total] of countResults) {
        nextCounts[status] = total
      }
      setCounts(nextCounts)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchOverview(controller.signal)
    return () => controller.abort()
  }, [fetchOverview])

  const pendingCount = counts.PENDING ?? 0
  const productionCount = (counts.ACCEPTED ?? 0) + (counts.IN_PRODUCTION ?? 0)
  const transitCount = (counts.SHIPMENT_CREATED ?? 0) + (counts.IN_TRANSIT ?? 0)
  const readyCount = readyTotal

  const deliveredRevenue = monthDelivered.reduce(
    (sum, order) => sum + Number(order.subtotal) + Number(order.shippingFee),
    0
  )
  const deliveredCommission = monthDelivered.reduce(
    (sum, order) => sum + Number(order.commissionAmount),
    0
  )

  const monthLabel = new Intl.DateTimeFormat('fr-MA', { month: 'long', year: 'numeric' }).format(
    new Date()
  )

  const kpis = [
    {
      name: "En attente d'acceptation",
      value: String(pendingCount),
      hint: 'À traiter en priorité',
      icon: ShoppingBag,
      color: 'text-amber-600',
      bg: 'bg-amber-100',
      href: '/dashboard/supplier/orders',
    },
    {
      name: 'En production',
      value: String(productionCount),
      hint: 'Acceptées ou en fabrication',
      icon: Factory,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
      href: '/dashboard/supplier/orders',
    },
    {
      name: 'Prêtes à expédier',
      value: String(readyCount),
      hint: 'Expédition à créer',
      icon: PackageCheck,
      color: 'text-indigo-600',
      bg: 'bg-indigo-100',
      href: '/dashboard/supplier/shipments',
    },
    {
      name: 'En transit',
      value: String(transitCount),
      hint: 'Confiées au transporteur',
      icon: Truck,
      color: 'text-sky-600',
      bg: 'bg-sky-100',
      href: '/dashboard/supplier/shipments',
    },
    {
      name: 'Livrées ce mois',
      value: String(monthDelivered.length),
      hint: monthLabel,
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-100',
      href: '/dashboard/supplier/orders',
    },
    {
      name: 'CA livré',
      value: formatCurrency(deliveredRevenue, 'MAD'),
      hint: 'Articles + livraison',
      icon: Banknote,
      color: 'text-emerald-600',
      bg: 'bg-emerald-100',
      href: '/dashboard/supplier/settlements',
    },
    {
      name: 'Commissions du mois',
      value: formatCurrency(deliveredCommission, 'MAD'),
      hint: 'Commission plateforme',
      icon: CreditCard,
      color: 'text-purple-600',
      bg: 'bg-purple-100',
      href: '/dashboard/supplier/settlements',
    },
  ]

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Bonjour, {session?.user?.email}
          </h1>
          <p className="text-gray-500">Voici un aperçu de votre activité</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/supplier/orders">
            <Button variant="outline">
              <ShoppingBag className="h-4 w-4 mr-2" />
              Commandes
            </Button>
          </Link>
          <Link href="/dashboard/supplier/products/new">
            <Button>
              <Package className="h-4 w-4 mr-2" />
              Nouveau produit
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Link key={kpi.name} href={kpi.href}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">{kpi.name}</CardTitle>
                <span className={cn('rounded-md p-1.5', kpi.bg, kpi.color)} aria-hidden="true">
                  <kpi.icon className="h-4 w-4" />
                </span>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold text-gray-900">{kpi.value}</div>
                )}
                <p className="text-xs text-gray-500 mt-1">{kpi.hint}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Alerte : commandes prêtes à expédier */}
      {!loading && readyCount > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-5 w-5" />
              {readyCount} commande{readyCount > 1 ? 's' : ''} en attente
              d&apos;expédition
            </CardTitle>
            <CardDescription className="text-amber-800">
              Ces commandes sont prêtes : créez l&apos;expédition pour générer le Code
              Suivi AMEEX.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {readyOrders.slice(0, 5).map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-4 py-2"
              >
                <div>
                  <p className="font-medium text-gray-900">{order.orderNumber}</p>
                  <p className="text-xs text-gray-500">
                    {order.reseller?.companyName || 'Client'} · {order.customerName}
                    {order.customerCity ? ` · ${order.customerCity}` : ''}
                  </p>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {formatCurrency(
                    Number(order.subtotal) + Number(order.shippingFee),
                    order.currency
                  )}
                </span>
              </div>
            ))}
            {readyCount > 5 && (
              <p className="text-xs text-amber-800">
                et {readyCount - 5} autre(s) commande(s)…
              </p>
            )}
            <Link href="/dashboard/supplier/orders" className="inline-block pt-1">
              <Button variant="outline" size="sm">
                Traiter les commandes
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Commandes récentes */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Commandes récentes</CardTitle>
            <CardDescription>Les 10 dernières commandes de votre atelier</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative w-full overflow-auto">
              {loading ? (
                <div className="space-y-2 py-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : recentOrders.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Aucune commande récente</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N° commande</TableHead>
                      <TableHead className="hidden sm:table-cell">Client</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium text-gray-900">
                          <p>{order.orderNumber}</p>
                          <p className="text-xs text-gray-500">
                            {formatDate(order.createdAt)}
                          </p>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <p className="font-medium text-gray-900">
                            {order.reseller?.companyName || 'Client'}
                          </p>
                          <p className="text-xs text-gray-500">{order.customerName}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(
                            Number(order.subtotal) + Number(order.shippingFee),
                            order.currency
                          )}
                        </TableCell>
                        <TableCell>
                          <OrderStatusBadge status={order.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableCaption>Commandes les plus récentes</TableCaption>
                </Table>
              )}
            </div>
            <Link
              href="/dashboard/supplier/orders"
              className="text-primary text-sm hover:underline block text-center mt-4"
            >
              Voir toutes les commandes
            </Link>
          </CardContent>
        </Card>

        {/* Actions rapides */}
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
      </div>
    </div>
  )
}
