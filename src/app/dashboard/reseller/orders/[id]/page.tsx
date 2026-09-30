'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Button,
  Textarea,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft,
  Ban,
  Loader2,
  AlertTriangle,
  Copy,
  Check,
  Truck,
  User,
  Building2,
} from 'lucide-react'
import {
  OrderStatusBadge,
  ShipmentStatusBadge,
  CodStatusBadge,
  CommissionStatusBadge,
  ORDER_STATUS_LABELS,
} from '@/components/status-badge'
import { formatCurrency, formatDateTime } from '@/lib/utils/helpers'
import {
  canResellerCancel,
  type OrderData,
  type OrderStatusType,
} from '@/components/reseller/order-types'

const ACTOR_LABELS: Record<string, string> = {
  RESELLER: 'Revendeur',
  SUPPLIER: 'Fournisseur',
  ADMIN: 'Administrateur',
  SYSTEM: 'Système',
}

export default function ResellerOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()
  const { id } = use(params)

  const [order, setOrder] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const fetchOrder = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/orders/${id}`)
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur lors du chargement de la commande')
      }
      const data: OrderData = await response.json()
      setOrder(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchOrder()
  }, [fetchOrder])

  async function copyTrackingCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Impossible de copier le Code Suivi dans le presse-papier')
    }
  }

  async function handleCancel() {
    setSubmitting(true)
    setDialogError(null)
    try {
      const response = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED', reason: reason.trim() || undefined }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'annulation')
      }
      setCancelOpen(false)
      setReason('')
      await fetchOrder()
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Erreur lors de l\'annulation')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error ?? 'Commande introuvable'}</span>
        </div>
        <Button variant="outline" onClick={() => router.push('/dashboard/reseller/orders')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour aux commandes
        </Button>
      </div>
    )
  }

  const currency = order.currency
  const shipment = order.shipments?.[0] ?? null
  const trackingCode = shipment?.trackingCode ?? null

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            href="/dashboard/reseller/orders"
            className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour aux commandes
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{order.orderNumber}</h1>
          <p className="text-gray-500">Créée le {formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex items-center gap-3">
          <OrderStatusBadge status={order.status} />
          {canResellerCancel(order.status) && (
            <Button variant="outline" onClick={() => setCancelOpen(true)}>
              <Ban className="h-4 w-4 mr-2" />
              Annuler la commande
            </Button>
          )}
        </div>
      </div>

      {(order.cancelledReason || order.rejectedReason) && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
          <span className="font-medium">
            {order.cancelledReason ? 'Motif d\'annulation' : 'Motif de refus'} :
          </span>{' '}
          {order.cancelledReason || order.rejectedReason}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Articles */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Articles</CardTitle>
              <CardDescription>
                Prix fournisseur figés au moment de la commande (§5.6)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative w-full overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produit</TableHead>
                      <TableHead className="text-right">Qté</TableHead>
                      <TableHead className="text-right">Prix fourn.</TableHead>
                      <TableHead className="text-right">Prix vente</TableHead>
                      <TableHead className="text-right">Total fourn.</TableHead>
                      <TableHead className="text-right">Total vente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="font-medium text-gray-900">
                            {item.product?.name ?? 'Produit'}
                          </p>
                          {item.variant && (
                            <p className="text-xs text-gray-500">
                              {item.variant.name} : {item.variant.value}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(Number(item.unitSupplierPrice), currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(Number(item.unitResellerPrice), currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(Number(item.totalSupplierPrice), currency)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-gray-900">
                          {formatCurrency(Number(item.totalResellerPrice), currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Code Suivi */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Truck className="h-5 w-5 text-gray-400" />
                Code Suivi
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {shipment ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    {trackingCode ? (
                      <span className="font-mono text-lg font-semibold text-gray-900">
                        {trackingCode}
                      </span>
                    ) : (
                      <span className="text-gray-500">Code Suivi non encore attribué</span>
                    )}
                    {trackingCode && (
                      <Button variant="outline" size="sm" onClick={() => copyTrackingCode(trackingCode)}>
                        {copied ? (
                          <Check className="h-4 w-4 mr-2 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4 mr-2" />
                        )}
                        {copied ? 'Copié' : 'Copier'}
                      </Button>
                    )}
                    <ShipmentStatusBadge status={shipment.status} />
                    {shipment.carrier && (
                      <Badge variant="secondary">{shipment.carrier}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    Aucun canal de notification n\'étant configuré, le Code Suivi reste affiché ici :
                    partagez-le manuellement avec votre client pour qu\'il suive son colis.
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-500">
                  Aucune expédition créée pour cette commande. Le fournisseur prépare la commande : le
                  Code Suivi apparaîtra dès que le colis sera enregistré.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Historique */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Historique du statut</CardTitle>
            </CardHeader>
            <CardContent>
              {order.statusHistory && order.statusHistory.length > 0 ? (
                <ol className="space-y-4">
                  {order.statusHistory.map((entry, index) => (
                    <li key={entry.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                        {index < order.statusHistory!.length - 1 && (
                          <span className="flex-1 w-px bg-gray-200 mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-1">
                        <p className="text-sm font-medium text-gray-900">
                          {entry.fromStatus
                            ? `${ORDER_STATUS_LABELS[entry.fromStatus as OrderStatusType]} → ${
                                ORDER_STATUS_LABELS[entry.toStatus] ?? entry.toStatus
                              }`
                            : `Commande créée (${ORDER_STATUS_LABELS[entry.toStatus] ?? entry.toStatus})`}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDateTime(entry.createdAt)} •{' '}
                          {ACTOR_LABELS[entry.actorRole] ?? entry.actorRole}
                        </p>
                        {entry.notes && <p className="text-xs text-gray-600 mt-1 italic">{entry.notes}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-gray-500">Aucun changement de statut enregistré</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Colonne latérale */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Montants</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Sous-total articles</span>
                <span>{formatCurrency(Number(order.subtotal), currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Livraison</span>
                <span>{formatCurrency(Number(order.shippingFee), currency)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
                <span className="text-gray-900">Total client (COD)</span>
                <span>{formatCurrency(Number(order.codAmount), currency)}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>Commission plateforme</span>
                <span>− {formatCurrency(Number(order.commissionAmount), currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Marge brute</span>
                <span>{formatCurrency(Number(order.grossMargin), currency)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
                <span className="text-gray-900">Marge nette</span>
                <span
                  className={
                    Number(order.netMargin) < 0 ? 'text-red-600' : 'text-green-600'
                  }
                >
                  {formatCurrency(Number(order.netMargin), currency)}
                </span>
              </div>
              <p className="text-xs text-gray-500 pt-2">
                La marge brute est calculée avant commission plateforme, la marge nette après.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5 text-gray-400" />
                Client final
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium text-gray-900">{order.customerName}</p>
              <p className="text-gray-600">{order.customerPhone}</p>
              {order.customerEmail && <p className="text-gray-600">{order.customerEmail}</p>}
              <p className="text-gray-600">{order.customerAddress}</p>
              <p className="text-gray-600">
                {order.customerCity}
                {order.customerPostalCode ? `, ${order.customerPostalCode}` : ''}
              </p>
              {order.customerNotes && (
                <p className="text-gray-500 italic pt-2">Note : {order.customerNotes}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="h-5 w-5 text-gray-400" />
                Fournisseur
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium text-gray-900">
                {order.supplier?.companyName ?? '—'}
              </p>
              <p className="text-gray-500">Livré depuis l'adresse de ramassage par défaut</p>
            </CardContent>
          </Card>

          {order.codCollection && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Encaissement COD</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Statut</span>
                  <CodStatusBadge status={order.codCollection.status} />
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Attendu</span>
                  <span>
                    {formatCurrency(Number(order.codCollection.expectedAmount), currency)}
                  </span>
                </div>
                {order.codCollection.collectedAmount !== null &&
                  order.codCollection.collectedAmount !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Encaissé</span>
                      <span>
                        {formatCurrency(Number(order.codCollection.collectedAmount), currency)}
                      </span>
                    </div>
                  )}
              </CardContent>
            </Card>
          )}

          {order.commission && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Commission plateforme</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Statut</span>
                  <CommissionStatusBadge status={order.commission.status} />
                </div>
                {order.commission.dueAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Échéance</span>
                    <span>{formatDateTime(order.commission.dueAt)}</span>
                  </div>
                )}
                {order.commission.paidAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Réglée le</span>
                    <span>{formatDateTime(order.commission.paidAt)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler la commande</DialogTitle>
            <DialogDescription>
              Vous êtes sur le point d\'annuler la commande {order.orderNumber}. Cette action est
              définitive.
            </DialogDescription>
          </DialogHeader>

          {dialogError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm">{dialogError}</span>
            </div>
          )}

          <div className="grid gap-2">
            <label htmlFor="detailCancelReason" className="text-sm font-medium text-gray-700">
              Motif (facultatif)
            </label>
            <Textarea
              id="detailCancelReason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex. : le client a changé d'avis"
              maxLength={500}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={submitting}>
              Fermer
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Annulation...
                </>
              ) : (
                'Confirmer l\'annulation'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
