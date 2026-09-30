import { prisma } from '@/lib/db/prisma'
import { decryptSecret } from '@/lib/crypto/secrets'

const DEFAULT_BASE_URL = process.env.AMEEX_BASE_URL || 'https://api.ameex.app'

export interface AmexCredentials {
  apiKey: string
  apiSecret: string
  accountId: string
  baseUrl: string
  testMode: boolean
  webhookSecret: string
  webhookUrl: string
}

/**
 * Lecture serveur des identifiants AMEEX : déchiffre ce qui est stocké dans
 * `CourierIntegration`. À n'utiliser que depuis le code serveur — le résultat
 * ne doit jamais être renvoyé tel quel par une route HTTP (§6.5).
 */
export async function resolveAmeexCredentials(): Promise<AmexCredentials | null> {
  const integration = await prisma.courierIntegration.findFirst({ where: { name: 'AMEEX' } })
  if (!integration) return null

  const config = (integration.config as { webhookSecret?: string; webhookUrl?: string } | null) ?? {}

  return {
    apiKey: decryptSecret(integration.apiKey) ?? '',
    apiSecret: decryptSecret(integration.apiSecret) ?? '',
    accountId: decryptSecret(integration.accountId) ?? '',
    baseUrl: integration.baseUrl || DEFAULT_BASE_URL,
    testMode: integration.testMode,
    webhookSecret: decryptSecret(config.webhookSecret) ?? '',
    webhookUrl: config.webhookUrl || '',
  }
}