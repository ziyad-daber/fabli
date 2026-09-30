'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Button,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { AlertTriangle, Loader2, Download, TrendingUp, Wallet, Percent, PackageCheck } from 'lucide-react'
import { OrderStatusBadge, CommissionStatusBadge } from '@/components/status-badge'
import { formatCurrency, formatDate } from '@/lib/utils/helpers'

interface CommissionOrder {
  id: string
  orderNumber: string
  status: string
  currency: string
  subtotal: string | number
  shippingFee: string | number
  codAmount: string | number
  commissionAmount: string | number
  commissionRate: string | number
  grossMargin: string | number
  netMargin: string | number
  createdAt: string
  deliveredAt: string | null
  supplier: { companyName: string } | null
  commission: { status: string; dueAt: string | null; paidAt: string | null } | null
}

interface CommissionsPayload {
  orders: CommissionOrder[]
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

const KPI_ICON = {
  revenue: TrendingUp,
  cod: Wallet,
  commission: Percent,
  gross: TrendingUp,
  net: PackageCheck,
  delivered: PackageCheck,
}

export default function ResellerCommissionsPage() {
  const [data, setData] = useState<CommissionsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/reseller/commissions', { signal: controller.signal })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || 'Erreur lors du chargement des commissions')
        }
        const payload: CommissionsPayload = await response.json()
        setData(payload)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Une erreur est survenue')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-sm">{error ?? 'Données indisponibles'}</span>
      </div>
    )
  }

  const { summary, counts, orders } = data

  const kpis = [
    {
      label: "Chiffre d'affaires (articles)",
      value: formatCurrency(summary.revenue),
      hint: `+ ${formatCurrency(summary.shipping)} de livraison encaissés`,
      icon: KPI_ICON.revenue,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
    },
    {
      label: 'COD attendu',
      value: formatCurrency(summary.codExpected),
      hint: 'Montant que vos clients paient à la livraison',
      icon: KPI_ICON.cod,
      color: 'text-orange-600',
      bg: 'bg-orange-100',
    },
    {
      label: 'Commissions plateforme',
      value: formatCurrency(summary.commission),
      hint: 'Prélevées sur le prix fournisseur',
      icon: KPI_ICON.commission,
      color: 'text-red-600',
      bg: 'bg-red-100',
    },
    {
      label: 'Marge brute cumulée',
      value: formatCurrency(summary.grossMargin),
      hint: 'Avant commission plateforme',
      icon: KPI_ICON.gross,
      color: 'text-purple-600',
      bg: 'bg-purple-100',
    },
    {
      label: 'Marge nette cumulée',
      value: formatCurrency(summary.netMargin),
      hint: 'Ce que vous conservez réellement',
      icon: KPI_ICON.net,
      color: 'text-green-600',
      bg: 'bg-green-100',
    },
    {
      label: 'Marge sur commandes livrées',
      value: formatCurrency(summary.deliveredNetMargin),
      hint: `${formatCurrency(summary.deliveredRevenue)} de CA livré · ${counts.delivered} livrée(s)`,
      icon: KPI_ICON.delivered,
      color: 'text-emerald-600',
      bg: 'bg-emerald-100',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marges &amp; commissions</h1>
          <p className="text-gray-500">
            {counts.total} commande{counts.total > 1 ? 's' : ''} · {counts.inProgress} en cours ·{' '}
            {counts.delivered} livrée{counts.delivered > 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => { window.location.href = '/api/reseller/commissions?format=csv' }}>
          <Download className="h-4 w-4 mr-2" />
          Exporter CSV
        </Button>
      </div>

      <p className="text-sm text-gray-600">
        La <strong>marge brute</strong> est calculée avant commission plateforme (prix de revente −
        prix fournisseur) ; la <strong>marge nette</strong> est ce qu\'il vous reste après la
        commission prélevée sur le prix fournisseur.
      </p>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{kpi.label}</CardTitle>
              <span className={`rounded p-2 ${kpi.bg}`}>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} aria-hidden="true" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{kpi.value}</div>
              <p className="text-xs text-gray-500 mt-1">{kpi.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Détail par commande */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <CardHeader className="px-6 pt-6">
          <CardTitle className="text-lg">Détail par commande</CardTitle>
          <CardDescription>Marge brute et nette de chacune de vos commandes</CardDescription>
        </CardHeader>
        <div className="relative w-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° commande</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Fournisseur</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead className="text-right">CA</TableHead>
                <TableHead className="text-right">COD</TableHead>
                <TableHead className="text-right">Marge brute</TableHead>
                <TableHead className="text-right">Marge nette</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="px-6 py-4 text-center text-gray-500">
                    Aucune commande : votre historique apparaîtra ici dès votre première commande
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <TableRow key={order.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium text-gray-900">
                      <Link
                        href={`/dashboard/reseller/orders/${order.id}`}
                        className="hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-gray-600">{formatDate(order.createdAt)}</TableCell>
                    <TableCell className="text-gray-600">
                      {order.supplier?.companyName ?? '—'}
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>
                      {order.commission ? (
                        <div>
                          <CommissionStatusBadge status={order.commission.status} />
                          <p className="text-xs text-gray-500 mt-1">
                            {formatCurrency(Number(order.commissionAmount), order.currency)} ·{' '}
                            {(Number(order.commissionRate) * 100).toFixed(0)} %
                          </p>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(Number(order.subtotal), order.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(Number(order.codAmount), order.currency)}
                    </TableCell>
                    <TableCell className="text-right text-gray-700">
                      {formatCurrency(Number(order.grossMargin), order.currency)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        Number(order.netMargin) < 0 ? 'text-red-600' : 'text-green-600'
                      }`}
                    >
                      {formatCurrency(Number(order.netMargin), order.currency)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableCaption>{orders.length} commande(s) analysée(s)</TableCaption>
          </Table>
        </div>
      </div>
    </div>
  )
}
