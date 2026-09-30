export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { DEFAULT_COMMISSION_RATE } from '@/lib/utils/commission'
import { audit, getRequestMeta } from '@/lib/utils/audit'
import { isEncryptionConfigured } from '@/lib/crypto/secrets'

/**
 * /api/admin/settings — paramètres de la plateforme (§5.6 « commission
 * configurable par l'administrateur », §8).
 *
 * La commission est stockée comme une fraction (0.10 = 10 %) et lue par la
 * création de commande, qui en fait un instantané figé.
 */

export interface PublicSettings {
  commissionRate: number
  platformName: string
  defaultCurrency: string
  commissionDueDays: number
  notificationChannel: string
  encryptionEnabled: boolean
  ameexConfigured: boolean
}

const DEFAULTS: Omit<PublicSettings, 'commissionRate' | 'encryptionEnabled' | 'ameexConfigured'> = {
  platformName: 'Fabli',
  defaultCurrency: 'MAD',
  commissionDueDays: 30,
  notificationChannel: 'log',
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const settings = await prisma.platformSetting.findMany()
    const map = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]))

    const commissionRate = Number(map.commission_rate ?? DEFAULT_COMMISSION_RATE)
    const integration = await prisma.courierIntegration.findFirst({
      where: { name: 'AMEEX' },
      select: { apiKey: true, accountId: true },
    })

    return NextResponse.json({
      settings: {
        commissionRate: Number.isFinite(commissionRate) ? commissionRate : DEFAULT_COMMISSION_RATE,
        platformName: map.platform_name ?? DEFAULTS.platformName,
        defaultCurrency: map.default_currency ?? DEFAULTS.defaultCurrency,
        commissionDueDays: Number(map.commission_due_days ?? DEFAULTS.commissionDueDays),
        notificationChannel: map.notification_channel ?? DEFAULTS.notificationChannel,
        encryptionEnabled: isEncryptionConfigured(),
        // La présence des identifiants est un booléen, jamais leur valeur.
        ameexConfigured: Boolean(integration?.apiKey && integration?.accountId),
      } satisfies PublicSettings,
      all: settings.map((setting) => ({
        key: setting.key,
        value: setting.value,
        description: setting.description,
        updatedAt: setting.updatedAt,
      })),
    })
  } catch (error) {
    console.error('[Settings GET] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

const settingsSchema = z.object({
  commissionRate: z
    .number()
    .min(0, 'Le taux ne peut pas être négatif')
    .max(0.5, 'Le taux ne peut pas dépasser 50 %')
    .optional(),
  platformName: z.string().min(2).max(80).optional(),
  defaultCurrency: z.string().length(3).optional(),
  commissionDueDays: z.number().int().min(1).max(365).optional(),
  notificationChannel: z.enum(['log', 'sms', 'whatsapp', 'email']).optional(),
})

const DESCRIPTIONS: Record<string, string> = {
  commission_rate: 'Taux de commission plateforme appliqué au prix fournisseur',
  platform_name: 'Nom affiché dans l\'interface',
  default_currency: 'Devise par défaut de la plateforme',
  commission_due_days: 'Délai d\'échéance d\'une commission, en jours',
  notification_channel: 'Canal de notification du Code Suivi au destinataire',
}

export async function PUT(request: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const body = await request.json()
    const validation = settingsSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const entries = Object.entries(validation.data).filter(([, value]) => value !== undefined)
    if (entries.length === 0) {
      return NextResponse.json({ error: 'Aucun paramètre à mettre à jour' }, { status: 400 })
    }

    const before = await prisma.platformSetting.findMany({
      where: { key: { in: entries.map(([key]) => key) } },
    })

    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.platformSetting.upsert({
          where: { key },
          create: {
            key,
            value: String(value),
            description: DESCRIPTIONS[key],
            updatedBy: session.user.id,
          },
          update: { value: String(value), updatedBy: session.user.id },
        })
      )
    )

    // Un changement de taux ne touche pas les commandes déjà créées : leurs
    // commissions sont des instantanés (§5.6).
    await audit({
      userId: session.user.id,
      action: 'SETTINGS_UPDATED',
      entityType: 'PlatformSetting',
      entityId: entries.map(([key]) => key).join(','),
      oldData: Object.fromEntries(before.map((setting) => [setting.key, setting.value])),
      newData: Object.fromEntries(entries),
      ...getRequestMeta(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Settings PUT] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}