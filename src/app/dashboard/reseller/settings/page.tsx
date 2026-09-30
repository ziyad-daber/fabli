'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Button, Input, Label, Switch } from '@/components/ui'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { AlertTriangle, Loader2, KeyRound, BellOff, Info } from 'lucide-react'
import { formatDate } from '@/lib/utils/helpers'
import { UserStatusBadge } from '@/components/status-badge'

interface PasswordForm {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export default function ResellerSettingsPage() {
  const { data: session } = useSession()

  const [profile, setProfile] = useState<{
    email: string
    role: string
    status: string
    createdAt: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [form, setForm] = useState<PasswordForm>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Préférence purement locale : le MVP n'expose pas d'API de notification
  // revendeur, la case est conservée pour que l'intention utilisateur soit
  // mémorisée sur son poste sans prétendre être synchronisée.
  const [emailNotifications, setEmailNotifications] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const response = await fetch('/api/profile', { signal: controller.signal })
        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || 'Erreur lors du chargement du compte')
        }
        const data = await response.json()
        const p = data.profile
        setProfile({
          email: p.email,
          role: p.role,
          status: p.status,
          createdAt: p.createdAt,
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem('fabli-reseller-notif')
    if (stored !== null) setEmailNotifications(stored === '1')
  }, [])

  function toggleNotifications(checked: boolean) {
    setEmailNotifications(checked)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('fabli-reseller-notif', checked ? '1' : '0')
    }
  }

  function validate(): boolean {
    if (!form.currentPassword) {
      setFormError('Le mot de passe actuel est requis')
      return false
    }
    if (form.newPassword.length < 8) {
      setFormError('Le nouveau mot de passe doit contenir au moins 8 caractères')
      return false
    }
    if (form.newPassword !== form.confirmPassword) {
      setFormError('Les deux mots de passe ne correspondent pas')
      return false
    }
    return true
  }

  async function handleChangePassword() {
    setFormError(null)
    setSuccess(null)
    if (!validate()) return

    setSaving(true)
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du changement de mot de passe')
      }
      setSuccess('Mot de passe modifié')
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur lors du changement de mot de passe')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-500">Sécurité du compte et préférences de notification</p>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{loadError}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Mot de passe */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-gray-400" />
              Mot de passe
            </CardTitle>
            <CardDescription>
              Choisissez un mot de passe d\'au moins 8 caractères que vous n\'utilisez pas ailleurs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="currentPassword">Mot de passe actuel *</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={form.currentPassword}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, currentPassword: e.target.value }))
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="newPassword">Nouveau mot de passe *</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={form.newPassword}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, newPassword: e.target.value }))
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirmer le mot de passe *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
                  }
                />
              </div>

              {formError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="text-sm">{formError}</span>
                </div>
              )}

              {success && (
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-green-800 text-sm">
                  {success}
                </div>
              )}

              <Button onClick={handleChangePassword} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Modification...
                  </>
                ) : (
                  'Changer le mot de passe'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Compte */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informations du compte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Email de connexion</span>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                ) : (
                  <span className="font-medium text-gray-900">
                    {profile?.email ?? session?.user?.email ?? '—'}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Rôle</span>
                <span className="font-medium text-gray-900 capitalize">
                  {profile?.role?.toLowerCase() ?? 'revendeur'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Statut</span>
                {profile?.status ? <UserStatusBadge status={profile.status} /> : '—'}
              </div>
              {profile?.createdAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Inscrit le</span>
                  <span className="font-medium text-gray-900">
                    {formatDate(profile.createdAt)}
                  </span>
                </div>
              )}
              <p className="text-xs text-gray-500 pt-2">
                L\'email, la raison sociale et l\'adresse se modifient depuis la page « Profil ».
              </p>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BellOff className="h-5 w-5 text-gray-400" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <label htmlFor="emailNotifications" className="text-sm text-gray-700">
                  Rappels par email
                </label>
                <Switch
                  id="emailNotifications"
                  checked={emailNotifications}
                  onCheckedChange={toggleNotifications}
                />
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-200 p-3 text-gray-600 text-sm">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  Dans ce MVP, les canaux de notification (email, SMS, WhatsApp) sont configurés au
                  niveau de la plateforme par l\'administrateur : aucun réglage par revendeur n\'est
                  disponible. Cette préférence est mémorisée uniquement sur ce poste. Le Code Suivi de
                  chaque colis reste de toute façon affiché et copiable depuis vos commandes et vos
                  expéditions.
                </p>
              </div>
              </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
