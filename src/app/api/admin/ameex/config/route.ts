export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { decryptSecret, encryptSecret, isEncryptionConfigured, maskSecret } from '@/lib/crypto/secrets'
import { audit, getRequestMeta, redact } from '@/lib/utils/audit'

const DEFAULT_BASE_URL = process.env.AMEEX_BASE_URL || 'https://api.ameex.app'

const configSchema = z.object({
  // Champs vides = conserver la valeur existante (§6.5 : jamais renvoyer les
  // secrets au navigateur, donc l'administrateur ne peut pas les réécrire).
  apiKey: z.string().optional(),
  apiKey2: z.string().optional(),
  accountId: z.string().optional(),
  baseUrl: z.string().url('URL invalide').optional(),
  webhookUrl: z.string().url('URL invalide').or(z.literal('')).optional(),
  webhookSecret: z.string().optional(),
  testMode: z.boolean().optional(),
})

export interface AmexConfigView {
  apiKey: string
  apiKey2: string
  accountId: string
  baseUrl: string
  webhookUrl: string
  webhookSecret: string
  testMode: boolean
  encryptionEnabled: boolean
  configured: boolean
}

function readConfig(integration: {
  apiKey: string | null
  apiSecret: string | null
  accountId: string | null
  baseUrl: string
  testMode: boolean
  config: unknown
} | null): AmexConfigView {
  const config = (integration?.config as { webhookUrl?: string; webhookSecret?: string } | null) ?? {}

  if (!integration) {
    return {
      apiKey: '',
      apiKey2: '',
      accountId: '',
      baseUrl: DEFAULT_BASE_URL,
      webhookUrl: '',
      webhookSecret: '',
      testMode: false,
      encryptionEnabled: isEncryptionConfigured(),
      configured: false,
    }
  }

  return {
    // Masqués : la valeur réelle ne quitte jamais le serveur (§6.5).
    apiKey: maskSecret(integration.apiKey),
    apiKey2: maskSecret(integration.apiSecret),
    accountId: maskSecret(integration.accountId),
    baseUrl: integration.baseUrl || DEFAULT_BASE_URL,
    webhookUrl: config.webhookUrl || '',
    webhookSecret: maskSecret(config.webhookSecret),
    testMode: integration.testMode,
    encryptionEnabled: isEncryptionConfigured(),
    configured: Boolean(integration.apiKey && integration.accountId),
  }
}

/**
 * Les identifiants déchiffrés ne sont jamais exposés : cette vue ne contient
 * que des valeurs masquées et des drapeaux d'état.
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const integration = await prisma.courierIntegration.findFirst({ where: { name: 'AMEEX' } })
    return NextResponse.json(readConfig(integration))
  } catch (error) {
    console.error('[AMEEX Config] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const body = await request.json()
    const validation = configSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const data = validation.data

    if (!isEncryptionConfigured()) {
      return NextResponse.json(
        {
          error:
            'AMEEX_ENCRYPTION_KEY doit être configurée avant d\'enregistrer des identifiants. Générez-la avec "openssl rand -hex 32".',
        },
        { status: 503 }
      )
    }

    const existing = await prisma.courierIntegration.findFirst({ where: { name: 'AMEEX' } })

    const existingConfig =
      (existing?.config as { webhookUrl?: string; webhookSecret?: string } | null) ?? {}
    const existingWebhookSecret = decryptSecret(existingConfig.webhookSecret) ?? ''

    // Un champ vide conserve la valeur déjà enregistrée.
    const apiKey = data.apiKey ? encryptSecret(data.apiKey) : existing?.apiKey ?? null
    const apiSecret = data.apiKey2 ? encryptSecret(data.apiKey2) : existing?.apiSecret ?? null
    const accountId = data.accountId ? encryptSecret(data.accountId) : existing?.accountId ?? null
    const webhookSecret = data.webhookSecret
      ? encryptSecret(data.webhookSecret)
      : encryptSecret(existingWebhookSecret)

    const configJson = {
      webhookUrl: data.webhookUrl ?? existingConfig.webhookUrl ?? '',
      // Le secret du webhook reste chiffré au repos comme les identifiants.
      webhookSecret,
    }

    const payload = {
      apiKey,
      apiSecret,
      accountId,
      baseUrl: data.baseUrl || existing?.baseUrl || DEFAULT_BASE_URL,
      testMode: data.testMode ?? existing?.testMode ?? false,
      config: configJson,
    }

    const integration = existing
      ? await prisma.courierIntegration.update({ where: { id: existing.id }, data: payload })
      : await prisma.courierIntegration.create({
          data: { name: 'AMEEX', isActive: true, ...payload },
        })

    await audit({
      userId: session.user.id,
      action: existing ? 'AMEEX_CONFIG_UPDATED' : 'AMEEX_CONFIG_CREATED',
      entityType: 'CourierIntegration',
      entityId: integration.id,
      newData: redact({
        baseUrl: payload.baseUrl,
        testMode: payload.testMode,
        apiKeyChanged: Boolean(data.apiKey),
        accountIdChanged: Boolean(data.accountId),
        webhookSecretChanged: Boolean(data.webhookSecret),
      }),
      ...getRequestMeta(request),
    })

    return NextResponse.json({ success: true, config: readConfig(integration) })
  } catch (error) {
    console.error('[AMEEX Config] Error:', error)
    const message =
      error instanceof Error ? error.message : "Erreur lors de l'enregistrement de la configuration"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}