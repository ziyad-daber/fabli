'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui'
import { UserStatusBadge } from '@/components/status-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils/helpers'
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Bell,
  UserCog,
  MapPin,
} from 'lucide-react'

interface ProfileResponse {
  profile: {
    id: string
    email: string
    role: string
    status: string
    createdAt: string
    supplierProfile: { companyName: string; city: string } | null
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
}

export default function SupplierSettingsPage() {
  const [profile, setProfile] = useState<ProfileResponse['profile'] | null>(null)
  const [addresses, setAddresses] = useState<PickupAddress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null)
  const [changingPassword, setChangingPassword] = useState(false)
  const [addressBusyId, setAddressBusyId] = useState<string | null>(null)
  const [addressNotice, setAddressNotice] = useState<string | null>(null)
  const [addressError, setAddressError] = useState<string | null>(null)

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const [profileRes, addressRes] = await Promise.all([
        fetch('/api/profile', { signal }),
        fetch('/api/pickup-addresses', { signal }),
      ])
      if (!profileRes.ok) {
        const data = await profileRes.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur lors du chargement du compte')
      }
      const profileData: ProfileResponse = await profileRes.json()
      setProfile(profileData.profile)

      if (addressRes.ok) {
        const addressData: { addresses: PickupAddress[] } = await addressRes.json()
        setAddresses(addressData.addresses || [])
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData])

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordNotice(null)

    if (passwords.newPassword.length < 8) {
      setPasswordError('Le nouveau mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordError('La confirmation ne correspond pas au nouveau mot de passe.')
      return
    }

    setChangingPassword(true)
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du changement de mot de passe')
      }
      setPasswordNotice('Mot de passe mis à jour avec succès.')
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : 'Erreur lors du changement de mot de passe'
      )
    } finally {
      setChangingPassword(false)
    }
  }

  async function handleSetDefaultAddress(address: PickupAddress) {
    setAddressBusyId(address.id)
    setAddressError(null)
    setAddressNotice(null)
    try {
      const response = await fetch('/api/pickup-addresses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: address.id,
          // La route PUT valide l'ensemble des champs : on renvoie l'adresse
          // telle qu'elle existe, en ne changeant que le drapeau par défaut.
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
      const refreshed = await fetch('/api/pickup-addresses')
      if (refreshed.ok) {
        const data2: { addresses: PickupAddress[] } = await refreshed.json()
        setAddresses(data2.addresses || [])
      }
    } catch (err) {
      setAddressError(
        err instanceof Error ? err.message : "Erreur lors du changement d'adresse par défaut"
      )
    } finally {
      setAddressBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-500">
          Sécurité du compte et réglages de vos expéditions
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Mot de passe */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Mot de passe
            </CardTitle>
            <CardDescription>
              Choisissez un mot de passe d&apos;au moins 8 caractères que vous
              n&apos;utilisez pas ailleurs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {passwordError && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="text-sm">{passwordError}</span>
              </div>
            )}
            {passwordNotice && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 p-3 text-green-800">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="text-sm">{passwordNotice}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Mot de passe actuel *</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={passwords.currentPassword}
                  onChange={(e) =>
                    setPasswords((p) => ({ ...p, currentPassword: e.target.value }))
                  }
                  required
                  disabled={changingPassword}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nouveau mot de passe *</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
                  required
                  minLength={8}
                  disabled={changingPassword}
                  helperText="8 caractères minimum"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmer le nouveau mot de passe *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={passwords.confirmPassword}
                  onChange={(e) =>
                    setPasswords((p) => ({ ...p, confirmPassword: e.target.value }))
                  }
                  required
                  disabled={changingPassword}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={changingPassword}>
                  Changer le mot de passe
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Infos du compte */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <UserCog className="h-5 w-5" />
                Informations du compte
              </CardTitle>
              <CardDescription>
                Ces champs sont gérés depuis la page Profil et ne sont pas modifiables ici.
              </CardDescription>
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
                    <dd>
                      {profile ? <UserStatusBadge status={profile.status} /> : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Entreprise</dt>
                    <dd className="font-medium text-gray-900">
                      {profile?.supplierProfile?.companyName || '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Inscrit le</dt>
                    <dd className="font-medium text-gray-900">
                      {profile?.createdAt ? formatDate(profile.createdAt) : '—'}
                    </dd>
                  </div>
                </dl>
              )}
              <Link
                href="/dashboard/supplier/profile"
                className="inline-block text-sm text-primary hover:underline"
              >
                Modifier mon profil professionnel
              </Link>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-gray-600">
              <p>
                Aucun réglage de notification individuel n&apos;est disponible pour le
                moment : les alertes de Code Suivi et de changement de statut sont gérées
                par la plateforme, qui les envoie aux revendeurs et aux clients concernés.
              </p>
              <p>
                Tant qu&apos;aucun canal de notification n&apos;est configuré, le Code
                Suivi reste affiché sur la page{' '}
                <Link href="/dashboard/supplier/shipments" className="text-primary hover:underline">
                  Expéditions
                </Link>{' '}
                et peut être copié manuellement.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Adresse de ramassage par défaut */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Adresse de ramassage par défaut
          </CardTitle>
          <CardDescription>
            Le revendeur qui ne choisit pas d&apos;adresse reçoit celle-ci sur ses
            commandes.
          </CardDescription>
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

          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : addresses.length === 0 ? (
            <div className="text-sm text-gray-500">
              Aucune adresse enregistrée.{' '}
              <Link href="/dashboard/supplier/profile" className="text-primary hover:underline">
                Ajoutez-en une depuis votre profil
              </Link>
              .
            </div>
          ) : (
            <ul className="space-y-2">
              {addresses.map((address) => (
                <li
                  key={address.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-gray-200 p-3"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {address.name}
                      {address.isDefault && (
                        <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
                          Par défaut
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-600">
                      {address.address}, {address.city}
                    </p>
                  </div>
                  {!address.isDefault && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetDefaultAddress(address)}
                      disabled={addressBusyId === address.id}
                    >
                      {addressBusyId === address.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MapPin className="h-4 w-4 mr-2" />
                      )}
                      Définir par défaut
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
