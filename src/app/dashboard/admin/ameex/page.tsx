'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, XCircle, Loader2, Save, TestTube, Webhook, Copy } from 'lucide-react'

interface AmexConfig {
  apiKey: string
  apiKey2: string
  accountId: string
  baseUrl: string
  webhookUrl: string
  webhookSecret: string
  testMode: boolean
}

export default function AmexConfigPage() {
  const [config, setConfig] = useState<AmexConfig>({
    apiKey: '',
    apiKey2: '',
    accountId: '',
    baseUrl: 'https://api.ameex.app',
    webhookUrl: '',
    webhookSecret: '',
    testMode: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [webhookResult, setWebhookResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    fetchConfig()
  }, [])

  async function fetchConfig() {
    try {
      const res = await fetch('/api/admin/ameex/config')
      if (res.ok) {
        const data = await res.json()
        setConfig({
          apiKey: data.apiKey || '',
          apiKey2: data.apiKey2 || '',
          accountId: data.accountId || '',
          baseUrl: data.baseUrl || 'https://api.ameex.app',
          webhookUrl: data.webhookUrl || '',
          webhookSecret: data.webhookSecret || '',
          testMode: data.testMode || false,
        })
        if (!data.webhookUrl) {
          const defaultWebhook = `${window.location.origin}/api/ameex/webhook`
          setConfig((prev) => ({ ...prev, webhookUrl: defaultWebhook }))
        }
      }
    } catch (error) {
      console.error('Failed to fetch config:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: keyof AmexConfig, value: string | boolean) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
    setSaveSuccess(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/ameex/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (res.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      }
    } catch (error) {
      console.error('Save failed:', error)
    } finally {
      setSaving(false)
    }
  }

  async function handleTestConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/ameex/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: config.apiKey,
          accountId: config.accountId,
          baseUrl: config.baseUrl,
        }),
      })
      const result = await res.json()
      setTestResult({
        success: result.success,
        message: result.message || result.error || 'Test effectué',
      })
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Erreur de connexion au serveur',
      })
    } finally {
      setTesting(false)
    }
  }

  async function handleTestWebhook() {
    setWebhookResult(null)
    try {
      const res = await fetch('/api/ameex/webhook', {
        method: 'GET',
      })
      const result = await res.json()
      setWebhookResult({
        success: result.success,
        message: result.message || 'Webhook reçu avec succès',
      })
    } catch (error) {
      setWebhookResult({
        success: false,
        message: 'Erreur lors du test du webhook',
      })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuration AMEEX</h1>
          <p className="text-gray-500">Configurer l'API AMEEX et le webhook pour la plateforme Fabli</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={config.testMode ? 'default' : 'outline'}
            onClick={() => handleChange('testMode', !config.testMode)}
          >
            {config.testMode ? 'Mode Test Actif' : 'Activer le Mode Test'}
          </Button>
        </div>
      </div>

      {saveSuccess && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription>Configuration enregistrée avec succès</AlertDescription>
        </Alert>
      )}

      {/* AMEEX API Credentials */}
      <Card>
        <CardHeader>
          <CardTitle>Identifiants API AMEEX</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="apiKey">API ID *</Label>
            <Input
              id="apiKey"
              type="text"
              value={config.apiKey}
              onChange={(e) => handleChange('apiKey', e.target.value)}
              placeholder="Votre API ID AMEEX"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="apiKey2">API Key *</Label>
            <Input
              id="apiKey2"
              type="password"
              value={config.apiKey2}
              onChange={(e) => handleChange('apiKey2', e.target.value)}
              placeholder="Votre API Key AMEEX"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="accountId">Account ID *</Label>
            <Input
              id="accountId"
              type="text"
              value={config.accountId}
              onChange={(e) => handleChange('accountId', e.target.value)}
              placeholder="Votre Account ID AMEEX"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="baseUrl">URL de base de l'API</Label>
            <Input
              id="baseUrl"
              type="url"
              value={config.baseUrl}
              onChange={(e) => handleChange('baseUrl', e.target.value)}
              placeholder="https://api.ameex.app"
            />
            <p className="text-xs text-gray-500">
              URL de base pour l'API AMEEX (par défaut: https://api.ameex.app)
            </p>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <Button
              onClick={handleTestConnection}
              disabled={testing || !config.apiKey || !config.accountId}
              className="w-full sm:w-auto"
            >
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Test de connexion...
                </>
              ) : (
                <>
                  <TestTube className="h-4 w-4 mr-2" />
                  Tester la connexion API
                </>
              )}
            </Button>

            {testResult && (
              <Alert
                className={`mt-4 ${
                  testResult.success
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <AlertDescription>{testResult.message}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Webhook Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration du Webhook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="webhookUrl">URL du Webhook</Label>
            <div className="flex gap-2">
              <Input
                id="webhookUrl"
                type="url"
                value={config.webhookUrl}
                onChange={(e) => handleChange('webhookUrl', e.target.value)}
                placeholder="https://votre-site.com/api/ameex/webhook"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigator.clipboard.writeText(config.webhookUrl)}
                title="Copier l'URL du webhook"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Cette URL doit être configurée dans le tableau de bord AMEEX pour recevoir les notifications
              (mise à jour de statut, livraison, etc.)
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="webhookSecret">Secret du Webhook</Label>
            <Input
              id="webhookSecret"
              type="password"
              value={config.webhookSecret}
              onChange={(e) => handleChange('webhookSecret', e.target.value)}
              placeholder="Secret pour valider les requêtes webhook"
            />
            <p className="text-xs text-gray-500">
              Utilisé pour valider la signature HMAC du webhook AMEEX
            </p>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <Button
              onClick={handleTestWebhook}
              variant="outline"
              className="w-full sm:w-auto"
            >
              <Webhook className="h-4 w-4 mr-2" />
              Tester le webhook
            </Button>

            {webhookResult && (
              <Alert
                className={`mt-4 ${
                  webhookResult.success
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                {webhookResult.success ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <AlertDescription>{webhookResult.message}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <Button
          onClick={handleSave}
          disabled={saving || !config.apiKey || !config.accountId}
          className="min-w-[120px]"
        >
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
      </div>
    </div>
  )
}
