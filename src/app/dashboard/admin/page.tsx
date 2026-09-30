'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui'
import { OrderStatusBadge } from '@/components/status-badge'
import { formatCurrency, formatDateTime } from '@/lib/utils/helpers'
import {
  AlertTriangle,
  CreditCard,
  Info,
  Loader2,
  Package,
  RefreshCw,
  Shield,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react'

type Decimal = string | number | null

interface StatsResponse {
  users: {
    total: number
    pendingValidation: number
    suppliers: number
    resellers: number
  }
  products: { total: number; active: number; draft: number }
  orders: {
    total: number
    thisMonth: number
    delivered: number
    pending: number
    inProgress: number
    byStatus: Record<string, number>
    stalled: number
  }
  shipments: {
    total: number
    inTransit: number
    delivered: number
    errors: number
    byStatus: Record<string, number>
  }
  finance: {
    codDeliveredRevenue: number
    commissions: Record<string, { count: number; amount: number }>
    cod: Record<string, { count: number; expected: number; collected: number }>
  }
  recentOrders: Array<{
    id: string
    orderNumber: string
    status: string
    codAmount: Decimal
    createdAt: string
    customerName: string
    supplier: { companyName: string } | null
  }>
  alerts: Array<{ level: 'info' | 'warning' | 'error'; message: string; href?: string }>
}

const COMMISSION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  DUE: 'Dûe',
  PAID: 'Réglée',
  DISPUTED: 'Contestée',
  REFUNDED: 'Remboursée',
}

const COD_STATUS_LABELS: Record<string, string> = {
  EXPECTED: 'Attendu',
  COLLECTED: 'Encaissé',
  SETTLED: 'Reversé',
  DISCREPANCY: 'Écart',
  REFUNDED: 'Remboursé',
}

const ALERT_STYLES: Record<'info' | 'warning' | 'error', string> = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  error: 'bg-red-50 border-red-200 text-red-800',
}

function amount(value: Decimal): number {
  const parsed = typeof value === 'string' ? parseFloat(value) : (value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async (signal: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/stats', { signal })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du chargement des statistiques')
      }
      setStats(data as StatsResponse)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void fetchStats(controller.signal)
    return () => controller.abort()
  }, [fetchStats])

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error && !stats) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-sm">{error}</span>
      </div>
    )
  }

  if (!stats) return null

  const commissionEntries = Object.entries(stats.finance.commissions ?? {})
  const codEntries = Object.entries(stats.finance.cod ?? {})

  const codExpected = codEntries.reduce((sum, [, value]) => sum + amount(value.expected), 0)
  const codCollected = codEntries.reduce((sum, [, value]) => sum + amount(value.collected), 0)

  const kpis = [
    {
      name: 'Utilisateurs',
      value: stats.users.total.toString(),
      detail: `${stats.users.suppliers} fournisseurs · ${stats.users.resellers} revendeurs`,
      href: '/dashboard/admin/users',
      icon: Users,
      color: 'text-blue-600',
    },
    {
      name: 'En attente de validation',
      value: stats.users.pendingValidation.toString(),
      detail: 'comptes à valider',
      href: '/dashboard/admin/users?status=PENDING_VERIFICATION',
      icon: Shield,
      color: stats.users.pendingValidation > 0 ? 'text-amber-600' : 'text-gray-600',
    },
    {
      name: 'Produits actifs',
      value: stats.products.active.toString(),
      detail: `${stats.products.draft} brouillon(s) sur ${stats.products.total}`,
      href: '/dashboard/admin/products',
      icon: Package,
      color: 'text-purple-600',
    },
    {
      name: 'Commandes ce mois',
      value: stats.orders.thisMonth.toString(),
      detail: `${stats.orders.total} au total`,
      href: '/dashboard/admin/orders',
      icon: ShoppingBag,
      color: 'text-orange-600',
    },
    {
      name: 'Commandes livrées',
      value: stats.orders.delivered.toString(),
      detail: `${stats.orders.inProgress} en cours · ${stats.orders.pending} en attente`,
      href: '/dashboard/admin/orders',
      icon: ShoppingBag,
      color: 'text-green-600',
    },
    {
      name: 'Expéditions en transit',
      value: stats.shipments.inTransit.toString(),
      detail:
        stats.shipments.errors > 0
          ? `${stats.shipments.errors} en erreur`
          : 'aucune erreur',
      href: '/dashboard/admin/shipments',
      icon: Truck,
      color: stats.shipments.errors > 0 ? 'text-red-600' : 'text-sky-600',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord administrateur</h1>
          <p className="text-gray-500">Vue d’ensemble de la plateforme Fabli</p>
        </div>
        <button
          type="button"
          onClick={() => {
            const controller = new AbortController()
            void fetchStats(controller.signal)
          }}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Actualiser
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <Card key={kpi.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{kpi.name}</CardTitle>
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{kpi.value}</div>
              <Link
                href={kpi.href}
                className="mt-1 block text-xs text-gray-500 hover:underline"
              >
                {kpi.detail}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Commandes récentes + alertes */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Commandes récentes</CardTitle>
            <CardDescription>
              CA encaissé sur les commandes livrées :{' '}
              {formatCurrency(stats.finance.codDeliveredRevenue)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative w-full overflow-auto">
              {stats.recentOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">Aucune commande</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Commande</TableHead>
                      <TableHead>Fournisseur</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Créée le</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.recentOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium text-gray-900">
                          {order.orderNumber}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {order.supplier?.companyName ?? '—'}
                        </TableCell>
                        <TableCell className="text-gray-600">{order.customerName}</TableCell>
                        <TableCell className="text-gray-900">
                          {formatCurrency(amount(order.codAmount))}
                        </TableCell>
                        <TableCell>
                          <OrderStatusBadge status={order.status} />
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {formatDateTime(order.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <div className="mt-4 text-center border-t border-gray-100 pt-4">
              <Link
                href="/dashboard/admin/orders"
                className="text-sm text-primary hover:underline"
              >
                Toutes les commandes
              </Link>
            </div>
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
            {stats.alerts.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune alerte active</p>
            ) : (
              stats.alerts.map((alert, index) => (
                <div
                  key={`${alert.message}-${index}`}
                  className={`flex items-start justify-between gap-2 rounded-lg border p-3 ${ALERT_STYLES[alert.level]}`}
                >
                  <span className="text-sm">{alert.message}</span>
                  {alert.href && (
                    <Link href={alert.href} className="shrink-0 text-sm font-medium hover:underline">
                      Voir
                    </Link>
                  )}
                </div>
              ))
            )}

            {stats.orders.stalled > 0 && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                <p className="text-sm font-medium text-orange-800">
                  {stats.orders.stalled} commande(s) bloquée(s)
                </p>
                <p className="mt-1 text-xs text-orange-700">
                  Aucun mouvement depuis 30 jours sur une commande acceptée ou en production.
                </p>
                <Link
                  href="/dashboard/admin/orders"
                  className="mt-2 block text-xs text-orange-800 hover:underline"
                >
                  Examiner les commandes
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Finance */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Commissions par statut
            </CardTitle>
            <CardDescription>
              Le taux s’applique aux nouvelles commandes : les commandes existantes gardent
              leur taux figé.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {commissionEntries.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune commission enregistrée</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Nombre</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissionEntries.map(([status, value]) => (
                    <TableRow key={status}>
                      <TableCell>
                        {COMMISSION_STATUS_LABELS[status] ?? status}
                      </TableCell>
                      <TableCell className="text-right text-gray-600">{value.count}</TableCell>
                      <TableCell className="text-right font-medium text-gray-900">
                        {formatCurrency(amount(value.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="mt-4 text-center border-t border-gray-100 pt-4">
              <Link
                href="/dashboard/admin/commissions"
                className="text-sm text-primary hover:underline"
              >
                Détail des commissions
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Code Suivi (COD)
            </CardTitle>
            <CardDescription>
              Attendu {formatCurrency(codExpected)} · encaissé {formatCurrency(codCollected)}
              {codExpected > 0 && (
                <span className={codCollected >= codExpected ? 'text-green-700' : 'text-red-700'}>
                  {' '}
                  ({Math.round((codCollected / codExpected) * 100)} %)
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {codEntries.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune collecte COD enregistrée</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Nombre</TableHead>
                    <TableHead className="text-right">Attendu</TableHead>
                    <TableHead className="text-right">Encaissé</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codEntries.map(([status, value]) => (
                    <TableRow key={status}>
                      <TableCell>{COD_STATUS_LABELS[status] ?? status}</TableCell>
                      <TableCell className="text-right text-gray-600">{value.count}</TableCell>
                      <TableCell className="text-right text-gray-900">
                        {formatCurrency(amount(value.expected))}
                      </TableCell>
                      <TableCell className="text-right text-gray-900">
                        {formatCurrency(amount(value.collected))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {codEntries.some(([status]) => status === 'DISCREPANCY') && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <XCircle className="h-4 w-4 shrink-0" />
                Des écarts de collecte sont à rapprocher.
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4 text-xs text-gray-500">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <Link href="/dashboard/admin/cod" className="text-primary hover:underline">
                Rapprocher les collectes COD
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
