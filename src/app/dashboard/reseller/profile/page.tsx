'use client'

import { useEffect, useState } from 'react'
import {
  Button,
  Input,
  Label,
  Skeleton,
} from '@/components/ui'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { AlertTriangle, Loader2, Save, BadgeCheck } from 'lucide-react'
import { formatDate } from '@/lib/utils/helpers'
import { UserStatusBadge } from '@/components/status-badge'

interface ResellerProfile {
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

interface ProfilePayload {
  id: string
  email: string
  role: string
  status: string
  createdAt: string
  resellerProfile: ResellerProfile | null
}

export default function ResellerProfilePage() {
  const [profile, setProfile] = useState<ProfilePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

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
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const response = await fetch('/api/profile', { signal: controller.signal })
        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || 'Erreur lors du chargement du profil')
        }
        const data = await response.json()
        const payload: ProfilePayload = data.profile
        setProfile(payload)

        const res = payload.resellerProfile
        setForm({
          companyName: res?.companyName ?? '',
          contactName: res?.contactName ?? '',
          phone: res?.phone ?? '',
          address: res?.address ?? '',
          city: res?.city ?? '',
          postalCode: res?.postalCode ?? '',
          ice: res?.ice ?? '',
          rc: res?.rc ?? '',
          email: payload.email ?? '',
        })
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setLoadError(err instanceof Error ? err.message : 'Une erreur est survenue')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [])

  function validate(): boolean {
    if (form.companyName.trim().length < 2) {
      setFormError('La raison sociale est requise')
      return false
    }
    if (form.contactName.trim().length < 2) {
      setFormError('Le nom du contact est requis')
      return false
    }
    if (form.phone.trim().length < 8) {
      setFormError('Le téléphone est requis (8 caractères minimum)')
      return false
    }
    if (form.address.trim().length < 5) {
      setFormError('L\'adresse est requise')
      return false
    }
    if (form.city.trim().length < 2) {
      setFormError('La ville est requise')
      return false
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setFormError('Email invalide')
      return false
    }
    return true
  }

  async function handleSave() {
    setFormError(null)
    setSuccess(null)
    if (!validate()) return

    setSaving(true)
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: form.companyName.trim(),
          contactName: form.contactName.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          city: form.city.trim(),
          postalCode: form.postalCode.trim() || undefined,
          ice: form.ice.trim() || undefined,
          rc: form.rc.trim() || undefined,
          email: form.email.trim() || undefined,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la mise à jour du profil')
      }
      setSuccess('Profil mis à jour')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour du profil')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mon profil</h1>
        <p className="text-gray-500">
          Ces informations apparaissent sur vos commandes et vos factures
        </p>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{loadError}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Informations professionnelles</CardTitle>
              <CardDescription>
                Renseignées auprès de l\'administrateur pour valider votre compte
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="companyName">Raison sociale *</Label>
                  <Input
                    id="companyName"
                    value={form.companyName}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, companyName: e.target.value }))
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="contactName">Nom du contact *</Label>
                  <Input
                    id="contactName"
                    value={form.contactName}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, contactName: e.target.value }))
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="phone">Téléphone *</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="email">Email de connexion</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>

                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="address">Adresse *</Label>
                  <Input
                    id="address"
                    value={form.address}
                    onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="city">Ville *</Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="postalCode">Code postal</Label>
                  <Input
                    id="postalCode"
                    value={form.postalCode}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, postalCode: e.target.value }))
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="ice">ICE</Label>
                  <Input
                    id="ice"
                    value={form.ice}
                    onChange={(e) => setForm((prev) => ({ ...prev, ice: e.target.value }))}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="rc">RC</Label>
                  <Input
                    id="rc"
                    value={form.rc}
                    onChange={(e) => setForm((prev) => ({ ...prev, rc: e.target.value }))}
                  />
                </div>
              </div>

              {formError && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="text-sm">{formError}</span>
                </div>
              )}

              {success && (
                <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-3 text-green-800 text-sm">
                  {success}
                </div>
              )}

              <Button className="mt-4" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Enregistrer
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Compte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Email</span>
                <span className="font-medium text-gray-900">{profile?.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Rôle</span>
                <span className="font-medium text-gray-900 capitalize">
                  {profile?.role?.toLowerCase()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Statut du compte</span>
                {profile?.status && <UserStatusBadge status={profile.status} />}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Profil validé</span>
                <span className="inline-flex items-center gap-1 font-medium">
                  {profile?.resellerProfile?.isVerified ? (
                    <>
                      <BadgeCheck className="h-4 w-4 text-green-600" />
                      <span className="text-green-700">Vérifié</span>
                    </>
                  ) : (
                    <span className="text-amber-700">En attente de vérification</span>
                  )}
                </span>
              </div>
              {profile?.createdAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Inscrit le</span>
                  <span className="font-medium text-gray-900">
                    {formatDate(profile.createdAt)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
