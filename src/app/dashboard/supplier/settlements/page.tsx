'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
  TableCaption,
  Button,
} from '@/components/ui'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { SettlementStatusBadge } from '@/components/status-badge'
import { cn, formatCurrency, formatDate } from '@/lib/utils/helpers'
import {
  Loader2,
  AlertTriangle,
  Download,
  ChevronDown,
  ChevronRight,
  Wallet,
  Clock,
  Coins,
} from 'lucide-react'

interface SettlementTransaction {
  id: string
  type: string
  amount: string | number
  currency: string
  description: string | null
  reference: string | null
  createdAt: string
}

interface Settlement {
  id: string
  reference: string | null
  periodStart: string
  periodEnd: string
  totalCommission: string | number
  totalCod: string | number
  netAmount: string | number
  currency: string
  status: string
  paidAt: string | null
  notes: string | null
  transactions: SettlementTransaction[]
}

interface SettlementsResponse {
  settlements: Settlement[]
  pending: {
    count: number
    amount: number
    items: { id: string; amount: string | number; currency: string; dueAt: string | null }[]
  }
  totals: { commissions: number; count: number }
}

/** Libellés des types de transaction de règlement. */
const TRANSACTION_LABELS: Record<string, string> = {
  COMMISSION: 'Commission',
  COD: 'Encaissement COD',
  PAYMENT: 'Versement',
  ADJUSTMENT: 'Ajustement',
  FEE: 'Frais',
  REFUND: 'Remboursement',
}

function transactionLabel(type: string): string {
  return TRANSACTION_LABELS[type] ?? type
}

export default function SupplierSettlementsPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [pending, setPending] = useState<SettlementsResponse['pending'] | null>(null)
  const [totals, setTotals] = useState<SettlementsResponse['totals'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchSettlements = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/supplier/settlements', { signal })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur lors du chargement des règlements')
      }
      const data: SettlementsResponse = await response.json()
      setSettlements(data.settlements || [])
      setPending(data.pending ?? null)
      setTotals(data.totals ?? null)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchSettlements(controller.signal)
    return () => controller.abort()
  }, [fetchSettlements])

  const cards = [
    {
      name: 'Commissions en attente',
      value: formatCurrency(Number(pending?.amount ?? 0), 'MAD'),
      hint: `${pending?.count ?? 0} commission(s) non réglée(s)`,
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-100',
    },
    {
      name: 'Total des commissions',
      value: formatCurrency(Number(totals?.commissions ?? 0), 'MAD'),
      hint: `${totals?.count ?? 0} commande(s) commissionnée(s)`,
      icon: Coins,
      color: 'text-purple-600',
      bg: 'bg-purple-100',
    },
    {
      name: 'Règlements enregistrés',
      value: String(settlements.length),
      hint: `${settlements.filter((s) => s.status === 'COMPLETED').length} payé(s)`,
      icon: Wallet,
      color: 'text-green-600',
      bg: 'bg-green-100',
    },
  ]

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commissions &amp; règlements</h1>
          <p className="text-gray-500">
            Suivi de vos commissions plateforme et des règlements émis par
            l&apos;administrateur
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            // Le téléchargement passe par le navigateur : la route renvoie un CSV.
            window.location.href = '/api/supplier/settlements?format=csv'
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Exporter en CSV
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Cartes */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{card.name}</CardTitle>
              <span className={cn('rounded-md p-1.5', card.bg, card.color)} aria-hidden="true">
                <card.icon className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                <div className="text-2xl font-bold text-gray-900">{card.value}</div>
              )}
              <p className="text-xs text-gray-500 mt-1">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Commissions en attente */}
      {pending && pending.items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Commissions en attente de règlement</CardTitle>
            <CardDescription>
              {pending.count} commission(s) pour un total de{' '}
              {formatCurrency(Number(pending.amount), 'MAD')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs text-gray-700">
                        {item.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {item.dueAt ? formatDate(item.dueAt) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium text-gray-900">
                        {formatCurrency(Number(item.amount), item.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableCaption>
                  Les commissions sont regroupées dans un règlement par période
                </TableCaption>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Règlements */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="relative w-full overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : settlements.length === 0 ? (
            <p className="text-gray-500 text-center py-12">Aucun règlement pour le moment</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Période</TableHead>
                  <TableHead className="text-right">Commissions</TableHead>
                  <TableHead className="hidden md:table-cell text-right">COD</TableHead>
                  <TableHead className="text-right">Montant net</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden lg:table-cell">Réglé le</TableHead>
                  <TableHead className="text-right">Détail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlements.map((settlement) => {
                  const isExpanded = expandedId === settlement.id
                  return [
                    <TableRow key={settlement.id}>
                      <TableCell className="font-medium text-gray-900">
                        {settlement.reference || '—'}
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {formatDate(settlement.periodStart)} → {formatDate(settlement.periodEnd)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(
                          Number(settlement.totalCommission),
                          settlement.currency
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right text-gray-600">
                        {formatCurrency(Number(settlement.totalCod), settlement.currency)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-gray-900">
                        {formatCurrency(Number(settlement.netAmount), settlement.currency)}
                      </TableCell>
                      <TableCell>
                        <SettlementStatusBadge status={settlement.status} />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-gray-600">
                        {settlement.paidAt ? formatDate(settlement.paidAt) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedId(isExpanded ? null : settlement.id)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          {settlement.transactions.length} ligne(s)
                        </Button>
                      </TableCell>
                    </TableRow>,
                    isExpanded ? (
                      <TableRow key={`${settlement.id}-detail`} className="bg-gray-50">
                        <TableCell colSpan={8} className="px-6 py-4">
                          {settlement.notes && (
                            <p className="mb-3 text-sm text-gray-600 italic">
                              Note : {settlement.notes}
                            </p>
                          )}
                          {settlement.transactions.length === 0 ? (
                            <p className="text-sm text-gray-500">
                              Aucune transaction détaillée sur ce règlement.
                            </p>
                          ) : (
                            <div className="rounded-lg border border-gray-200 bg-white overflow-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Référence</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="text-right">Montant</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {settlement.transactions.map((transaction) => (
                                    <TableRow key={transaction.id}>
                                      <TableCell className="font-medium text-gray-900">
                                        {transactionLabel(transaction.type)}
                                      </TableCell>
                                      <TableCell className="text-gray-600">
                                        {transaction.description || '—'}
                                      </TableCell>
                                      <TableCell className="font-mono text-xs text-gray-600">
                                        {transaction.reference || '—'}
                                      </TableCell>
                                      <TableCell className="text-gray-600">
                                        {formatDate(transaction.createdAt)}
                                      </TableCell>
                                      <TableCell className="text-right font-medium text-gray-900">
                                        {formatCurrency(
                                          Number(transaction.amount),
                                          transaction.currency
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : null,
                  ]
                })}
              </TableBody>
              <TableCaption>
                {settlements.length} règlement(s) — cliquez sur « ligne(s) » pour détail
              </TableCaption>
            </Table>
          )}
        </div>
      </div>
    </div>
  )
}
