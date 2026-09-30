'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui'
import { formatDateTime } from '@/lib/utils/helpers'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  MapPin,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react'

type NotificationChannel = 'log' | 'sms' | 'whatsapp' | 'email'

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  log: 'Journal serveur uniquement',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
}

interface Settings {
  commissionRate: number
  platformName: string
  defaultCurrency: string
  commissionDueDays: number
  notificationChannel: string
  encryptionEnabled: boolean
  ameexConfigured: boolean
}

interface SettingRow {
  key: string
  value: string
  description: string | null
  updatedAt: string
}

interface SettingsResponse {
  settings: Settings
  all: SettingRow[]
}

interface AmexConfig {
  baseUrl: string
  testMode: boolean
  configured: boolean
  encryptionEnabled: boolean
}

interface City {
  id: string
  name: string
  ameexId: string
  isActive: boolean
  _count: { orders: number; pickupAddresses: number }
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [allSettings, setAllSettings] = useState<SettingRow[]>([])
  const [amex, setAmex] = useState<AmexConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    platformName: '',
    commissionRatePercent: '10',
    defaultCurrency: 'MAD',
    commissionDueDays: '30',
    notificationChannel: 'log' as NotificationChannel,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  const [cities, setCities] = useState<City[]>([])
  const [citiesLoading, setCitiesLoading] = useState(true)
  const [citiesError, setCitiesError] = useState<string | null>(null)
  const [cityForm, setCityForm] = useState({ name: '', ameexId: '' })
  const [cityError, setCityError] = useState<string | null>(null)
  const [citySuccess, setCitySuccess] = useState<string | null>(null)
  const [citySaving, setCitySaving] = useState(false)
  const [deletingCityId, setDeletingCityId] = useState<string | null>(null)

  const fetchSettings = useCallback(async (signal: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/settings', { signal })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du chargement des paramètres')
      }

      const payload: SettingsResponse = data
      setSettings(payload.settings)
      setAllSettings(payload.all ?? [])
      setForm({
        platformName: payload.settings.platformName,
        commissionRatePercent: String(Math.round(payload.settings.commissionRate * 10000) / 100),
        defaultCurrency: payload.settings.defaultCurrency,
        commissionDueDays: String(payload.settings.commissionDueDays),
        notificationChannel: (payload.settings.notificationChannel ||
          'log') as NotificationChannel,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])

  const fetchCities = useCallback(async (signal: AbortSignal) => {
    setCitiesLoading(true)
    setCitiesError(null)
    try {
      const response = await fetch('/api/admin/cities', { signal })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du chargement des villes')
      }
      const payload: { cities?: City[] } = data
      setCities(payload.cities ?? [])
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setCitiesError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      if (!signal.aborted) setCitiesLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void fetchSettings(controller.signal)
    return () => controller.abort()
  }, [fetchSettings])

  useEffect(() => {
    const controller = new AbortController()
    void fetchCities(controller.signal)
    return () => controller.abort()
  }, [fetchCities])

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch('/api/admin/ameex/config', { signal: controller.signal })
        if (!response.ok) return
        const data = (await response.json()) as AmexConfig
        setAmex(data)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }
    void load()
    return () => controller.abort()
  }, [])

  async function handleSaveSettings() {
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(null)
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platformName: form.platformName,
          // L'API stocke une fraction : 10 % est envoyé 0.1.
          commissionRate: Number(form.commissionRatePercent) / 100,
          defaultCurrency: form.defaultCurrency.toUpperCase(),
          commissionDueDays: Number(form.commissionDueDays),
          notificationChannel: form.notificationChannel,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de l'enregistrement")
      }
      setSaveSuccess('Paramètres enregistrés')
      const controller = new AbortController()
      await fetchSettings(controller.signal)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement")
    } finally {
      setSaving(false)
    }
  }

  async function handleAddCity() {
    setCitySaving(true)
    setCityError(null)
    setCitySuccess(null)
    try {
      const response = await fetch('/api/admin/cities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cityForm.name, ameexId: cityForm.ameexId, isActive: true }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de l'enregistrement de la ville")
      }
      setCityForm({ name: '', ameexId: '' })
      setCitySuccess('Ville enregistrée')
      const controller = new AbortController()
      await fetchCities(controller.signal)
    } catch (err) {
      setCityError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement")
    } finally {
      setCitySaving(false)
    }
  }

  async function handleDeleteCity(city: City) {
    const confirmed = window.confirm(
      `Supprimer la ville « ${city.name} » ? Si elle est utilisée par des commandes, elle sera seulement désactivée.`
    )
    if (!confirmed) return

    setDeletingCityId(city.id)
    setCityError(null)
    setCitySuccess(null)
    try {
      const response = await fetch(`/api/admin/cities?id=${encodeURIComponent(city.id)}`, {
        method: 'DELETE',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la suppression')
      }
      setCitySuccess(data.message ?? 'Ville supprimée')
      const controller = new AbortController()
      await fetchCities(controller.signal)
    } catch (err) {
      setCityError(err instanceof Error ? err.message : 'Erreur lors de la suppression')
    } finally {
      setDeletingCityId(null)
    }
  }

  if (loading && !settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error && !settings) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-sm">{error}</span>
      </div>
    )
  }

  const encryptionEnabled = settings?.encryptionEnabled ?? false
  const ameexConfigured = settings?.ameexConfigured ?? false

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres de la plateforme</h1>
        <p className="text-gray-500">Configuration générale, intégrations et référentiel villes</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Paramètres généraux */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Paramètres généraux</CardTitle>
          <CardDescription>
            Le taux de commission ne s’applique qu’aux nouvelles commandes : celles déjà créées
            conservent le taux figé à leur création.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="platform-name">Nom de la plateforme</Label>
              <Input
                id="platform-name"
                value={form.platformName}
                onChange={(e) => setForm((prev) => ({ ...prev, platformName: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="commission-rate">Taux de commission (%)</Label>
              <Input
                id="commission-rate"
                type="number"
                min={0}
                max={50}
                step="0.01"
                value={form.commissionRatePercent}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, commissionRatePercent: e.target.value }))
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="default-currency">Devise par défaut</Label>
              <Input
                id="default-currency"
                maxLength={3}
                value={form.defaultCurrency}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, defaultCurrency: e.target.value.toUpperCase() }))
                }
                placeholder="MAD"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="due-days">Échéance des commissions (jours)</Label>
              <Input
                id="due-days"
                type="number"
                min={1}
                max={365}
                value={form.commissionDueDays}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, commissionDueDays: e.target.value }))
                }
              />
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="notification-channel">Canal de notification</Label>
              <Select
                value={form.notificationChannel}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    notificationChannel: value as NotificationChannel,
                  }))
                }
              >
                <SelectTrigger id="notification-channel" className="sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CHANNEL_LABELS) as NotificationChannel[]).map((channel) => (
                    <SelectItem key={channel} value={channel}>
                      {CHANNEL_LABELS[channel]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {saveError && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm">{saveError}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 p-3 text-green-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="text-sm">{saveSuccess}</span>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Enregistrer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* AMEEX */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Intégration AMEEX</CardTitle>
          <CardDescription>
            Les identifiants sont chiffrés et ne sont jamais renvoyés au navigateur ; ils se
            modifient depuis la page AMEEX.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Chiffrement des secrets</p>
              <p
                className={`mt-1 flex items-center gap-2 text-sm font-medium ${
                  encryptionEnabled ? 'text-green-700' : 'text-red-700'
                }`}
              >
                {encryptionEnabled ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {encryptionEnabled ? 'Actif' : 'Désactivé'}
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Identifiants AMEEX</p>
              <p
                className={`mt-1 flex items-center gap-2 text-sm font-medium ${
                  ameexConfigured ? 'text-green-700' : 'text-amber-700'
                }`}
              >
                {ameexConfigured ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                {ameexConfigured ? 'Configurés' : 'Non configurés'}
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500">URL de base</p>
              <p className="mt-1 break-all text-sm font-medium text-gray-900">
                {amex?.baseUrl ?? '—'}
              </p>
              {amex && (
                <p className="mt-1 text-xs text-gray-500">
                  Mode {amex.testMode ? 'test' : 'production'}
                </p>
              )}
            </div>
          </div>

          {!encryptionEnabled && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
              <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-sm">
                Le chiffrement des secrets est désactivé. Définissez la variable
                d’environnement <code className="font-mono">AMEEX_ENCRYPTION_KEY</code> (générée
                avec <code className="font-mono">openssl rand -hex 32</code>) puis redémarrez
                l’application : aucun identifiant ne pourra être enregistré tant qu’elle est
                absente.
              </p>
            </div>
          )}

          {ameexConfigured && (
            <p className="flex items-start gap-2 text-xs text-gray-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              La clé API et le compte sont enregistrés. Modifiez-les depuis la section AMEEX.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Villes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Villes (AMEEX)
          </CardTitle>
          <CardDescription>
            L’API AMEEX exige un identifiant de ville et non un nom libre : cette table fait la
            correspondance. Sans correspondance, la création d’expédition est refusée avec un
            message explicite.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor="city-name">Ville</Label>
              <Input
                id="city-name"
                value={cityForm.name}
                onChange={(e) => setCityForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Casablanca"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="city-ameex-id">Identifiant AMEEX</Label>
              <Input
                id="city-ameex-id"
                value={cityForm.ameexId}
                onChange={(e) => setCityForm((prev) => ({ ...prev, ameexId: e.target.value }))}
                placeholder="CAS-001"
              />
            </div>
            <Button
              onClick={handleAddCity}
              disabled={citySaving || !cityForm.name || !cityForm.ameexId}
            >
              {citySaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Ajouter
            </Button>
          </div>

          {cityError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm">{cityError}</span>
            </div>
          )}

          {citySuccess && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 p-3 text-green-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="text-sm">{citySuccess}</span>
            </div>
          )}

          {citiesError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm">{citiesError}</span>
            </div>
          )}

          <div className="rounded-lg border border-gray-200">
            <div className="relative w-full overflow-auto">
              {citiesLoading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ville</TableHead>
                      <TableHead>Identifiant AMEEX</TableHead>
                      <TableHead>État</TableHead>
                      <TableHead className="text-right">Commandes</TableHead>
                      <TableHead className="text-right">Adresses</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cities.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="px-6 py-4 text-center text-gray-500">
                          Aucune ville enregistrée
                        </TableCell>
                      </TableRow>
                    ) : (
                      cities.map((city) => (
                        <TableRow key={city.id}>
                          <TableCell className="font-medium text-gray-900">{city.name}</TableCell>
                          <TableCell className="text-gray-600">{city.ameexId}</TableCell>
                          <TableCell>
                            <span
                              className={
                                city.isActive ? 'text-sm text-green-700' : 'text-sm text-gray-500'
                              }
                            >
                              {city.isActive ? 'Active' : 'Désactivée'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-gray-600">
                            {city._count?.orders ?? 0}
                          </TableCell>
                          <TableCell className="text-right text-gray-600">
                            {city._count?.pickupAddresses ?? 0}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="destructive"
                              size="icon"
                              onClick={() => handleDeleteCity(city)}
                              disabled={deletingCityId === city.id}
                              title="Supprimer la ville"
                            >
                              {deletingCityId === city.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Journal des paramètres */}
      {allSettings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Paramètres enregistrés</CardTitle>
            <CardDescription>Valeurs actuellement en base</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clé</TableHead>
                  <TableHead>Valeur</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Dernière modification</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allSettings.map((setting) => (
                  <TableRow key={setting.key}>
                    <TableCell className="font-mono text-xs text-gray-700">{setting.key}</TableCell>
                    <TableCell className="text-gray-900">{setting.value}</TableCell>
                    <TableCell className="text-gray-600">{setting.description ?? '—'}</TableCell>
                    <TableCell className="text-gray-600">
                      {formatDateTime(setting.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
