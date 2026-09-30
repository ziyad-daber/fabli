'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Button,
  Input,
  Label,
  Textarea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { AlertTriangle, Loader2, ShoppingCart, Trash2, Package } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/helpers'
import { CartProvider, useCart } from '@/components/reseller/cart-context'

interface CustomerForm {
  customerName: string
  customerPhone: string
  customerEmail: string
  customerAddress: string
  customerCity: string
  customerPostalCode: string
  customerNotes: string
}

const EMPTY_FORM: CustomerForm = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  customerAddress: '',
  customerCity: '',
  customerPostalCode: '',
  customerNotes: '',
}

function CartContent() {
  const router = useRouter()
  const { items, hydrated, updateItem, removeItem, clear, count } = useCart()

  const [shippingFee, setShippingFee] = useState('0')
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const supplier = items[0] ?? null

  const subtotal = items.reduce((sum, item) => sum + item.resellerPrice * item.quantity, 0)
  const shipping = Number(shippingFee) || 0
  const clientTotal = subtotal + shipping

  function validate(): boolean {
    const errors: Record<string, string> = {}

    if (!form.customerName.trim() || form.customerName.trim().length < 2) {
      errors.customerName = 'Nom du client requis (2 caractères minimum)'
    }
    if (!/^[0-9+\s().-]{8,}$/.test(form.customerPhone.trim())) {
      errors.customerPhone = 'Téléphone du client requis (8 caractères minimum)'
    }
    if (form.customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail.trim())) {
      errors.customerEmail = 'Email invalide'
    }
    if (form.customerAddress.trim().length < 5) {
      errors.customerAddress = 'Adresse de livraison requise (5 caractères minimum)'
    }
    if (form.customerCity.trim().length < 2) {
      errors.customerCity = 'Ville de livraison requise'
    }
    // Garde-fou identique à celui du serveur : le revente sous le prix de gros
    // serait rejetée avec un message que l'utilisateur ne verrait qu'après coup.
    for (const item of items) {
      if (item.resellerPrice < item.supplierPrice) {
        errors.items = `Le prix de vente de « ${item.name} » (${item.resellerPrice} MAD) est inférieur au prix fournisseur (${item.supplierPrice} MAD).`
      }
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit() {
    setServerError(null)
    if (!validate() || !supplier) return

    setSubmitting(true)
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Une commande porte exactement un fournisseur ; le panier l'implique déjà.
          supplierId: supplier.supplierId,
          items: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            resellerPrice: item.resellerPrice,
          })),
          shippingFee: shipping,
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone.trim(),
          customerEmail: form.customerEmail.trim() || undefined,
          customerAddress: form.customerAddress.trim(),
          customerCity: form.customerCity.trim(),
          customerPostalCode: form.customerPostalCode.trim() || undefined,
          customerNotes: form.customerNotes.trim() || undefined,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la création de la commande')
      }

      clear()
      router.push(`/dashboard/reseller/orders/${data.id}`)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Erreur lors de la création de la commande')
    } finally {
      setSubmitting(false)
    }
  }

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Panier</h1>
          <p className="text-gray-500">Aucune commande en préparation</p>
        </div>
        <Card className="text-center py-12">
          <ShoppingCart className="mx-auto h-10 w-10 text-gray-300 mb-4" aria-hidden="true" />
          <p className="text-gray-500 mb-4">Votre panier est vide.</p>
          <Link href="/dashboard/reseller/catalog">
            <Button>Parcourir le catalogue</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finaliser la commande</h1>
          <p className="text-gray-500">
            {count} article{count > 1 ? 's' : ''} — fournisseur : {supplier?.supplierName}
          </p>
        </div>
        <Button variant="outline" onClick={clear} disabled={submitting}>
          <Trash2 className="h-4 w-4 mr-2" />
          Vider le panier
        </Button>
      </div>

      {formErrors.items && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="text-sm">{formErrors.items}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Lignes du panier */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Articles</CardTitle>
            <CardDescription>
              Une commande ne peut porter qu\'un seul fournisseur : tous vos articles doivent venir de «{' '}
              {supplier?.supplierName} ».
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
                    <TableHead className="text-right">Prix de vente</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const negative = item.resellerPrice < item.supplierPrice
                    return (
                      <TableRow key={`${item.productId}-${item.variantId ?? 'none'}`}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 shrink-0 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                              {item.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={item.image}
                                  alt={item.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Package className="h-5 w-5 text-gray-400" aria-hidden="true" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{item.name}</p>
                              {item.variantLabel && (
                                <p className="text-xs text-gray-500">{item.variantLabel}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={1}
                            max={999}
                            value={item.quantity}
                            onChange={(e) =>
                              updateItem(
                                item.productId,
                                { quantity: Math.max(1, Number(e.target.value) || 1) },
                                item.variantId
                              )
                            }
                            className="w-20 ml-auto"
                            aria-label={`Quantité pour ${item.name}`}
                          />
                        </TableCell>
                        <TableCell className="text-right text-gray-600">
                          {formatCurrency(item.supplierPrice)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.resellerPrice}
                            onChange={(e) =>
                              updateItem(
                                item.productId,
                                { resellerPrice: Number(e.target.value) || 0 },
                                item.variantId
                              )
                            }
                            className="w-28 ml-auto"
                            aria-label={`Prix de vente pour ${item.name}`}
                          />
                          {negative && (
                            <p className="text-xs text-red-600 mt-1">
                              Sous le prix fournisseur
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium text-gray-900">
                          {formatCurrency(item.resellerPrice * item.quantity)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Retirer ${item.name}`}
                            onClick={() => removeItem(item.productId, item.variantId)}
                            disabled={submitting}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 max-w-xs ml-auto space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Sous-total articles</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="shippingFee" className="text-gray-500">
                  Livraison
                </label>
                <Input
                  id="shippingFee"
                  type="number"
                  min={0}
                  step="0.01"
                  value={shippingFee}
                  onChange={(e) => setShippingFee(e.target.value)}
                  className="w-28"
                />
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
                <span className="text-gray-900">Total client (COD)</span>
                <span>{formatCurrency(clientTotal)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Client final */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Client final</CardTitle>
            <CardDescription>Ces informations servent à la livraison du colis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {serverError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="text-sm">{serverError}</span>
                </div>
              )}

              <div className="grid gap-1">
                <Label htmlFor="customerName">Nom complet *</Label>
                <Input
                  id="customerName"
                  value={form.customerName}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, customerName: e.target.value }))
                  }
                />
                {formErrors.customerName && (
                  <p className="text-xs text-red-600">{formErrors.customerName}</p>
                )}
              </div>

              <div className="grid gap-1">
                <Label htmlFor="customerPhone">Téléphone *</Label>
                <Input
                  id="customerPhone"
                  value={form.customerPhone}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, customerPhone: e.target.value }))
                  }
                  placeholder="06 12 34 56 78"
                />
                {formErrors.customerPhone && (
                  <p className="text-xs text-red-600">{formErrors.customerPhone}</p>
                )}
              </div>

              <div className="grid gap-1">
                <Label htmlFor="customerEmail">Email</Label>
                <Input
                  id="customerEmail"
                  type="email"
                  value={form.customerEmail}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, customerEmail: e.target.value }))
                  }
                />
                {formErrors.customerEmail && (
                  <p className="text-xs text-red-600">{formErrors.customerEmail}</p>
                )}
              </div>

              <div className="grid gap-1">
                <Label htmlFor="customerAddress">Adresse de livraison *</Label>
                <Textarea
                  id="customerAddress"
                  rows={2}
                  value={form.customerAddress}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, customerAddress: e.target.value }))
                  }
                />
                {formErrors.customerAddress && (
                  <p className="text-xs text-red-600">{formErrors.customerAddress}</p>
                )}
              </div>

              <div className="grid gap-1">
                <Label htmlFor="customerCity">Ville *</Label>
                <Input
                  id="customerCity"
                  value={form.customerCity}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, customerCity: e.target.value }))
                  }
                />
                {formErrors.customerCity && (
                  <p className="text-xs text-red-600">{formErrors.customerCity}</p>
                )}
              </div>

              <div className="grid gap-1">
                <Label htmlFor="customerPostalCode">Code postal</Label>
                <Input
                  id="customerPostalCode"
                  value={form.customerPostalCode}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, customerPostalCode: e.target.value }))
                  }
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="customerNotes">Notes</Label>
                <Textarea
                  id="customerNotes"
                  rows={2}
                  value={form.customerNotes}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, customerNotes: e.target.value }))
                  }
                  placeholder="Ex. : appeler avant la livraison"
                />
              </div>

              <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Création...
                  </>
                ) : (
                  'Finaliser la commande'
                )}
              </Button>
              <p className="text-xs text-gray-500">
                Le colis sera ramassé à l\'adresse par défaut du fournisseur {supplier?.supplierName}.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function ResellerCartPage() {
  return (
    <CartProvider>
      <CartContent />
    </CartProvider>
  )
}
