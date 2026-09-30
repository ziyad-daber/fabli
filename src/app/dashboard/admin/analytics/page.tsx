'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import { OrderStatusBadge, ORDER_STATUS_LABELS } from '@/components/status-badge'
import { formatCurrency } from '@/lib/utils/helpers'
import { AlertTriangle, BarChart3, Loader2, TrendingUp } from 'lucide-react'

type Decimal = string | number | null

interface OrderItem {
  productId: string
  quantity: number
  totalResellerPrice: Decimal
  product: { id: string; name: string }
}

interface AnalyticsOrder {
  id: string
  orderNumber: string
  status: string
  subtotal: Decimal
  shippingFee: Decimal
  codAmount: Decimal
  commissionAmount: Decimal
  grossMargin: Decimal
  netMargin: Decimal
  currency: string
  createdAt: string
  customerName: string
  customerCity: string | null
  supplier: { id: string; companyName: string } | null
  reseller: { id: string; companyName: string } | null
  items: OrderItem[]
  codCollection: {
    expectedAmount: Decimal
    collectedAmount: Decimal
    status: string
  } | null
}

interface OrdersResponse {
  orders: AnalyticsOrder[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

interface Aggregated {
  label: string
  value: number
  secondary?: number
}

const MONTH_LABELS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
]

function amount(value: Decimal): number {
  const parsed = typeof value === 'string' ? parseFloat(value) : (value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-')
  const index = Number(month) - 1
  const name = MONTH_LABELS[index] ?? month
  return `${name} ${year.slice(2)}`
}

// Le libellé côté API est typé par l'énumération Prisma alors que la réponse
// JSON est un string : la lecture doit passer par un index large.
function statusLabel(status: string): string {
  return (ORDER_STATUS_LABELS as Record<string, string>)[status] ?? status
}

export default function AdminAnalyticsPage() {
  const [orders, setOrders] = useState<AnalyticsOrder[]>([])
  const [sampleTotal, setSampleTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currency, setCurrency] = useState('MAD')

  // L'API limite la page à 100 lignes : les agrégats portent sur cet échantillon
  // des commandes les plus récentes, ce qui est signalé dans l'interface.
  const fetchOrders = useCallback(async (signal: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/orders?page=1&limit=100', { signal })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du chargement des commandes')
      }
      const payload: OrdersResponse = data
      setOrders(payload.orders ?? [])
      setSampleTotal(payload.pagination?.total ?? 0)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void fetchOrders(controller.signal)
    return () => controller.abort()
  }, [fetchOrders])

  const analytics = useMemo(() => {
    let deliveredRevenue = 0
    let totalCommission = 0
    let totalGrossMargin = 0
    let totalNetMargin = 0
    let codExpected = 0
    let codCollected = 0

    const byStatus = new Map<string, number>()
    const bySupplier = new Map<string, number>()
    const byProduct = new Map<string, number>()
    const byMonth = new Map<string, { revenue: number; commission: number }>()

    for (const order of orders) {
      const revenue = amount(order.subtotal) + amount(order.shippingFee)
      const commission = amount(order.commissionAmount)
      const supplierName = order.supplier?.companyName ?? 'Fournisseur inconnu'

      byStatus.set(order.status, (byStatus.get(order.status) ?? 0) + 1)
      bySupplier.set(supplierName, (bySupplier.get(supplierName) ?? 0) + revenue)

      for (const item of order.items) {
        const name = item.product?.name ?? 'Produit inconnu'
        byProduct.set(name, (byProduct.get(name) ?? 0) + item.quantity)
      }

      if (order.status === 'DELIVERED') {
        deliveredRevenue += revenue
        totalGrossMargin += amount(order.grossMargin)
        totalNetMargin += amount(order.netMargin)
      }

      totalCommission += commission

      const collection = order.codCollection
      if (collection) {
        codExpected += amount(collection.expectedAmount)
        codCollected += amount(collection.collectedAmount)
      }

      const createdAt = new Date(order.createdAt)
      const monthKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`
      const monthEntry = byMonth.get(monthKey) ?? { revenue: 0, commission: 0 }
      monthEntry.revenue += revenue
      monthEntry.commission += commission
      byMonth.set(monthKey, monthEntry)
    }

    const statusDistribution: Aggregated[] = [...byStatus.entries()]
      .map(([label, value]) => ({ label: statusLabel(label), value }))
      .sort((a, b) => b.value - a.value)

    const topSuppliers: Aggregated[] = [...bySupplier.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)

    const topProducts: Aggregated[] = [...byProduct.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)

    const monthly: Aggregated[] = [...byMonth.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, entry]) => ({
        label: monthLabel(key),
        value: entry.revenue,
        secondary: entry.commission,
      }))

    return {
      deliveredRevenue,
      totalCommission,
      totalGrossMargin,
      totalNetMargin,
      codExpected,
      codCollected,
      statusDistribution,
      topSuppliers,
      topProducts,
      monthly,
    }
  }, [orders])

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const maxOf = (rows: Aggregated[], pick: (row: Aggregated) => number) =>
    rows.reduce((max, row) => Math.max(max, pick(row)), 0)

  function BarRows({
    rows,
    max,
    format,
  }: {
    rows: Aggregated[]
    max: number
    format: (value: number) => string
  }) {
    if (rows.length === 0) {
      return <p className="py-4 text-center text-sm text-gray-500">Aucune donnée</p>
    }
    return (
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{row.label}</span>
              <span className="font-medium text-gray-900">{format(row.value)}</span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-primary"
                style={{ width: `${max > 0 ? (row.value / max) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const kpis = [
    {
      name: 'CA livré',
      value: formatCurrency(analytics.deliveredRevenue, currency),
      detail: 'commandes livrées uniquement',
    },
    {
      name: 'Commission totale',
      value: formatCurrency(analytics.totalCommission, currency),
      detail: 'toutes commandes confondues',
    },
    {
      name: 'Marge nette',
      value: formatCurrency(analytics.totalNetMargin, currency),
      detail: `marge brute ${formatCurrency(analytics.totalGrossMargin, currency)}`,
    },
    {
      name: 'COD encaissé',
      value: formatCurrency(analytics.codCollected, currency),
      detail: `attendu ${formatCurrency(analytics.codExpected, currency)}`,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analyses</h1>
          <p className="text-gray-500">
            Agrégats calculés sur {orders.length} commande{orders.length > 1 ? 's' : ''} récente
            {orders.length > 1 ? 's' : ''} sur {sampleTotal}
          </p>
        </div>
        <Select
          value={currency}
          onValueChange={setCurrency}
        >
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="Devise" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MAD">MAD</SelectItem>
            <SelectItem value="EUR">EUR</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.name}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{kpi.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-gray-900">{kpi.value}</div>
              <p className="mt-1 text-xs text-gray-500">{kpi.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Évolution mensuelle
            </CardTitle>
            <CardDescription>Chiffre d’affaires et commissions par mois de création</CardDescription>
          </CardHeader>
          <CardContent>
            <BarRows
              rows={analytics.monthly}
              max={maxOf(analytics.monthly, (row) => row.value)}
              format={(value) => formatCurrency(value, currency)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Répartition par statut</CardTitle>
            <CardDescription>Nombre de commandes dans l’échantillon analysé</CardDescription>
          </CardHeader>
          <CardContent>
            <BarRows
              rows={analytics.statusDistribution}
              max={maxOf(analytics.statusDistribution, (row) => row.value)}
              format={(value) => `${value}`}
            />
            {orders.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                {analytics.statusDistribution.map((row) => {
                  const raw = orders.find((order) => statusLabel(order.status) === row.label)
                  return raw ? <OrderStatusBadge key={row.label} status={raw.status} /> : null
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top 5 fournisseurs par CA</CardTitle>
            <CardDescription>Chiffre d’affaires total, tous statuts confondus</CardDescription>
          </CardHeader>
          <CardContent>
            <BarRows
              rows={analytics.topSuppliers}
              max={maxOf(analytics.topSuppliers, (row) => row.value)}
              format={(value) => formatCurrency(value, currency)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top 5 produits par quantité</CardTitle>
            <CardDescription>Unités commandées sur l’échantillon</CardDescription>
          </CardHeader>
          <CardContent>
            <BarRows
              rows={analytics.topProducts}
              max={maxOf(analytics.topProducts, (row) => row.value)}
              format={(value) => `${value} u.`}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Commandes récentes analysées
          </CardTitle>
          <CardDescription>Échantillon utilisé pour tous les calculs ci-dessus</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-gray-200">
            <div className="relative w-full overflow-auto max-h-96">
              <table className="w-full caption-bottom text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Commande</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Client</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Ville</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500">CA</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500">Commission</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-500">Marge nette</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                        Aucune commande
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr key={order.id} className="border-t border-gray-100">
                        <td className="px-4 py-2 font-medium text-gray-900">{order.orderNumber}</td>
                        <td className="px-4 py-2 text-gray-600">{order.customerName}</td>
                        <td className="px-4 py-2 text-gray-600">{order.customerCity ?? '—'}</td>
                        <td className="px-4 py-2 text-right text-gray-900">
                          {formatCurrency(
                            amount(order.subtotal) + amount(order.shippingFee),
                            order.currency || currency
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-600">
                          {formatCurrency(amount(order.commissionAmount), order.currency || currency)}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-600">
                          {formatCurrency(amount(order.netMargin), order.currency || currency)}
                        </td>
                        <td className="px-4 py-2">
                          <OrderStatusBadge status={order.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
