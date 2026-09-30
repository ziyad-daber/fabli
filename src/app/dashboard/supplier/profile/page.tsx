'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Input,
  Label,
  Checkbox,
} from '@/components/ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils/helpers'
import {
  Loader2,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Star,
  CheckCircle2,
  Building2,
} from 'lucide-react'

interface SupplierProfile {
  id: string
  companyName: string
  contactName: string
  phone: string
  address: string
  city: string
  postalCode: string | null
  ice: string | null
  rc: string | null
  isVerified: boolean
}

interface ProfileResponse {
  profile: {
    id: string
    email: string
    role: string
    status: string
    createdAt: string
    supplierProfile: SupplierProfile | null
    resellerProfile: null
  }
}

interface PickupAddress {
  id: string
  name: string
  contactName: string
  phone: string
  address: string
  city: string
  postalCode: string | null
  isDefault: boolean
  ameexCity: { id: string; name: string; ameexId: number } | null
}

const EMPTY_ADDRESS = {
  name: '',
  contactName: '',
  phone: '',
  address: '',
  city: '',
  postalCode: '',
  isDefault: false,
}

type AddressForm = typeof EMPTY_ADDRESS

export default function SupplierProfilePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'success' | 'warning'; message: string } | null>(
    null
  )

  const [profile, setProfile] = useState<ProfileResponse['profile'] | null>(null)
  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
    ice: '',
    rc: '',
    email: '',
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [addresses, setAddresses] = useState<PickupAddress[]>([])
  const [addressesLoading, setAddressesLoading] = useState(true)
  const [addressError, setAddressError] = useState<string | null>(null)
  const [addressNotice, setAddressNotice] = useState<string | null>(null)
  const [addressBusyId, setAddressBusyId] = useState<string | null>(null)

  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false)
  const [editingAddress, setEditingAddress] = useState<PickupAddress | null>(null)
  const [addressForm, setAddressForm] = useState<AddressForm>(EMPTY_ADDRESS)
  const [savingAddress, setSavingAddress] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PickupAddress | null>(null)
  const [deletingAddress, setDeletingAddress] = useState(false)

  const fetchProfile = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/profile', { signal })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur lors du chargement du profil')
      }
      const data: ProfileResponse = await response.json()
      setProfile(data.profile)
      const supplier = data.profile.supplierProfile
      setForm({
        companyName: supplier?.companyName ?? '',
        contactName: supplier?.contactName ?? '',
        phone: supplier?.phone ?? '',
        address: supplier?.address ?? '',
        city: supplier?.city ?? '',
        postalCode: supplier?.postalCode ?? '',
        ice: supplier?.ice ?? '',
        rc: supplier?.rc ?? '',
        email: data.profile.email ?? '',
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  const fetchAddresses = useCallback(async (signal?: AbortSignal) => {
    setAddressesLoading(true)
    setAddressError(null)
    try {
      const response = await fetch('/api/pickup-addresses', { signal })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur lors du chargement des adresses')
      }
      const data: { addresses: PickupAddress[] } = await response.json()
      setAddresses(data.addresses || [])
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setAddressError(
        err instanceof Error ? err.message : 'Erreur lors du chargement des adresses'
      )
    } finally {
      if (!signal?.aborted) setAddressesLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchProfile(controller.signal)
    fetchAddresses(controller.signal)
    return () => controller.abort()
  }, [fetchProfile, fetchAddresses])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    setProfileError(null)
    setNotice(null)
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: form.companyName,
          contactName: form.contactName,
          phone: form.phone,
          address: form.address,
          city: form.city,
          postalCode: form.postalCode || undefined,
          ice: form.ice || undefined,
          rc: form.rc || undefined,
          email: form.email,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la mise à jour du profil')
      }
      setNotice({ type: 'success', message: 'Profil mis à jour avec succès.' })
      await fetchProfile()
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : 'Erreur lors de la mise à jour du profil'
      )
    } finally {
      setSavingProfile(false)
    }
  }

  function openAddressDialog(address: PickupAddress | null) {
    setEditingAddress(address)
    setAddressForm(
      address
        ? {
            name: address.name,
            contactName: address.contactName,
            phone: address.phone,
            address: address.address,
            city: address.city,
            postalCode: address.postalCode ?? '',
            isDefault: address.isDefault,
          }
        : EMPTY_ADDRESS
    )
    setDialogError(null)
    setIsAddressDialogOpen(true)
  }

  async function handleSaveAddress() {
    setSavingAddress(true)
    setDialogError(null)
    try {
      const response = await fetch(
        editingAddress ? '/api/pickup-addresses' : '/api/pickup-addresses',
        {
          method: editingAddress ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            editingAddress ? { id: editingAddress.id, ...addressForm } : addressForm
          ),
        }
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l’enregistrement de l’adresse')
      }
      setAddressNotice(
        editingAddress ? 'Adresse mise à jour.' : 'Adresse ajoutée à vos sites de ramassage.'
      )
      setIsAddressDialogOpen(false)
      await fetchAddresses()
    } catch (err) {
      setDialogError(
        err instanceof Error ? err.message : 'Erreur lors de l’enregistrement de l’adresse'
      )
    } finally {
      setSavingAddress(false)
    }
  }

  async function handleSetDefault(address: PickupAddress) {
    setAddressBusyId(address.id)
    setAddressError(null)
    setAddressNotice(null)
    try {
      const response = await fetch('/api/pickup-addresses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: address.id,
          name: address.name,
          contactName: address.contactName,
          phone: address.phone,
          address: address.address,
          city: address.city,
          postalCode: address.postalCode ?? undefined,
          isDefault: true,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || "Erreur lors du changement d'adresse par défaut")
      }
      setAddressNotice(`« ${address.name} » est désormais l'adresse de ramassage par défaut.`)
      await fetchAddresses()
    } catch (err) {
      setAddressError(
        err instanceof Error ? err.message : "Erreur lors du changement d'adresse par défaut"
      )
    } finally {
      setAddressBusyId(null)
    }
  }

  async function handleDeleteAddress() {
    if (!deleteTarget) return
    setDeletingAddress(true)
    setAddressError(null)
    setAddressNotice(null)
    try {
      const response = await fetch(`/api/pickup-addresses?id=${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la suppression')
      }
      setAddressNotice(
        data.ordersAffected > 0
          ? `Adresse supprimée. ${data.ordersAffected} commande(s) conservent la référence mais n'ont plus d'adresse de ramassage.`
          : 'Adresse supprimée.'
      )
      setDeleteTarget(null)
      await fetchAddresses()
    } catch (err) {
      setAddressError(
        err instanceof Error ? err.message : 'Erreur lors de la suppression'
      )
    } finally {
      setDeletingAddress(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mon profil</h1>
        <p className="text-gray-500">
          Informations professionnelles et sites de ramassage de vos colis
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {notice && (
        <div
          className={
            notice.type === 'warning'
              ? 'flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900'
              : 'flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 p-3 text-green-800'
          }
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="text-sm">{notice.message}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profil professionnel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Profil professionnel
            </CardTitle>
            <CardDescription>
              Ces informations apparaissent sur vos expéditions et chez vos revendeurs
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <form onSubmit={handleSaveProfile} className="space-y-4">
                {profileError && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="text-sm">{profileError}</span>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Raison sociale *</Label>
                    <Input
                      id="companyName"
                      value={form.companyName}
                      onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
                      required
                      disabled={savingProfile}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactName">Nom du contact *</Label>
                    <Input
                      id="contactName"
                      value={form.contactName}
                      onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))}
                      required
                      disabled={savingProfile}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Téléphone *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                      required
                      disabled={savingProfile}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      required
                      disabled={savingProfile}
                      helperText="Utilisé pour la connexion et les notifications"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Adresse *</Label>
                  <Input
                    id="address"
                    value={form.address}
                    onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                    required
                    disabled={savingProfile}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="city">Ville *</Label>
                    <Input
                      id="city"
                      value={form.city}
                      onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                      required
                      disabled={savingProfile}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postalCode">Code postal</Label>
                    <Input
                      id="postalCode"
                      value={form.postalCode}
                      onChange={(e) => setForm((p) => ({ ...p, postalCode: e.target.value }))}
                      disabled={savingProfile}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ice">ICE</Label>
                    <Input
                      id="ice"
                      value={form.ice}
                      onChange={(e) => setForm((p) => ({ ...p, ice: e.target.value }))}
                      disabled={savingProfile}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rc">RC (registre de commerce)</Label>
                    <Input
                      id="rc"
                      value={form.rc}
                      onChange={(e) => setForm((p) => ({ ...p, rc: e.target.value }))}
                      disabled={savingProfile}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" loading={savingProfile}>
                    Enregistrer le profil
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Informations du compte */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Compte</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <dl className="space-y-2">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Email</dt>
                  <dd className="font-medium text-gray-900">{profile?.email}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Rôle</dt>
                  <dd className="font-medium text-gray-900">Fournisseur</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Statut</dt>
                  <dd className="font-medium text-gray-900">{profile?.status}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Inscrit le</dt>
                  <dd className="font-medium text-gray-900">
                    {profile?.createdAt ? formatDate(profile.createdAt) : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Profil vérifié</dt>
                  <dd className="font-medium text-gray-900">
                    {profile?.supplierProfile?.isVerified ? 'Oui' : 'En attente'}
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Adresses de ramassage */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Adresses de ramassage
            </CardTitle>
            <CardDescription>
              Utilisées pour générer les expéditions de vos commandes
            </CardDescription>
          </div>
          <Button onClick={() => openAddressDialog(null)}>
            <Plus className="h-4 w-4 mr-2" />
            Ajouter une adresse
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {addressError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="text-sm">{addressError}</span>
            </div>
          )}

          {addressNotice && (
            <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 p-3 text-green-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="text-sm">{addressNotice}</span>
            </div>
          )}

          {addressesLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : addresses.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-8">
              Aucune adresse de ramassage enregistrée. Ajoutez-en au moins une pour pouvoir
              créer des expéditions.
            </p>
          ) : (
            <ul className="space-y-3">
              {addresses.map((address) => (
                <li
                  key={address.id}
                  className="rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 flex items-center gap-2">
                        {address.name}
                        {address.isDefault && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
                            <Star className="h-3 w-3" />
                            Par défaut
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {address.address}, {address.city}
                        {address.postalCode ? ` ${address.postalCode}` : ''}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Contact : {address.contactName} · {address.phone}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      {!address.isDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetDefault(address)}
                          disabled={addressBusyId === address.id}
                        >
                          {addressBusyId === address.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Star className="h-4 w-4 mr-2" />
                          )}
                          Par défaut
                        </Button>
                      )}
                      <Button variant="outline" size="icon" onClick={() => openAddressDialog(address)} title="Modifier">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => setDeleteTarget(address)}
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {!address.ameexCity && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <p className="text-sm">
                        La ville « {address.city} » n&apos;est pas encore rattachée à un
                        identifiant AMEEX. Un administrateur doit la faire mapper avant
                        qu&apos;une expédition puisse être créée pour cette adresse.
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Dialogue d'adresse */}
      <Dialog open={isAddressDialogOpen} onOpenChange={setIsAddressDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAddress ? "Modifier l'adresse" : 'Ajouter une adresse'}
            </DialogTitle>
            <DialogDescription>
              L&apos;adresse de ramassage par défaut est proposée automatiquement au
              revendeur lorsqu&apos;il passe commande.
            </DialogDescription>
          </DialogHeader>

          {dialogError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="text-sm">{dialogError}</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="addr-name">Nom du site *</Label>
              <Input
                id="addr-name"
                value={addressForm.name}
                onChange={(e) => setAddressForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Atelier principal"
                disabled={savingAddress}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addr-contact">Nom du contact *</Label>
              <Input
                id="addr-contact"
                value={addressForm.contactName}
                onChange={(e) => setAddressForm((p) => ({ ...p, contactName: e.target.value }))}
                disabled={savingAddress}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addr-phone">Téléphone *</Label>
              <Input
                id="addr-phone"
                type="tel"
                value={addressForm.phone}
                onChange={(e) => setAddressForm((p) => ({ ...p, phone: e.target.value }))}
                disabled={savingAddress}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addr-city">Ville *</Label>
              <Input
                id="addr-city"
                value={addressForm.city}
                onChange={(e) => setAddressForm((p) => ({ ...p, city: e.target.value }))}
                disabled={savingAddress}
                helperText="Doit correspondre à une ville reconnue par AMEEX"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="addr-address">Adresse complète *</Label>
              <Input
                id="addr-address"
                value={addressForm.address}
                onChange={(e) => setAddressForm((p) => ({ ...p, address: e.target.value }))}
                disabled={savingAddress}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addr-postal">Code postal</Label>
              <Input
                id="addr-postal"
                value={addressForm.postalCode}
                onChange={(e) => setAddressForm((p) => ({ ...p, postalCode: e.target.value }))}
                disabled={savingAddress}
              />
            </div>
            <div className="flex items-end">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="addr-default"
                  checked={addressForm.isDefault}
                  onCheckedChange={(checked) =>
                    setAddressForm((p) => ({ ...p, isDefault: checked === true }))
                  }
                  disabled={savingAddress}
                />
                <Label htmlFor="addr-default" className="mb-0 font-normal">
                  Adresse par défaut
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddressDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleSaveAddress}
              loading={savingAddress}
              disabled={
                !addressForm.name ||
                !addressForm.contactName ||
                !addressForm.phone ||
                !addressForm.address ||
                !addressForm.city
              }
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation de suppression */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Supprimer l&apos;adresse
            </h2>
            <p className="text-sm text-gray-600">
              Supprimer « {deleteTarget.name} » ? Les commandes déjà liées conserveront leur
              historique, mais sans adresse de ramassage.
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Annuler
              </Button>
              <Button variant="destructive" onClick={handleDeleteAddress} loading={deletingAddress}>
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
