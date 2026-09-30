export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const configSchema = z.object({
  apiKey: z.string().min(1, 'API Key est requis'),
  apiKey2: z.string().optional(),
  accountId: z.string().min(1, 'Account ID est requis'),
  baseUrl: z.string().url('URL invalide').default('https://api.ameex.app'),
  webhookUrl: z.string().url('URL invalide').optional(),
  webhookSecret: z.string().optional(),
  testMode: z.boolean().default(false),
})

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const integration = await prisma.courierIntegration.findFirst({
      where: { name: 'AMEEX' },
    })

    if (!integration) {
      return NextResponse.json({
        apiKey: '',
        apiKey2: '',
        accountId: '',
        baseUrl: 'https://api.ameex.app',
        webhookUrl: '',
        webhookSecret: '',
        testMode: false,
      })
    }

    return NextResponse.json({
      apiKey: integration.apiKey || '',
      apiKey2: integration.apiSecret || '',
      accountId: integration.accountId || '',
      baseUrl: integration.baseUrl,
      webhookUrl: (integration.config as { webhookUrl?: string } | null)?.webhookUrl || '',
      webhookSecret: (integration.config as { webhookSecret?: string } | null)?.webhookSecret || '',
      testMode: integration.testMode,
    })
  } catch (error) {
    console.error('[AMEEX Config] Error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
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

    const configJson = {
      webhookUrl: data.webhookUrl || '',
      webhookSecret: data.webhookSecret || '',
    }

    const existing = await prisma.courierIntegration.findFirst({
      where: { name: 'AMEEX' },
    })

    if (existing) {
      await prisma.courierIntegration.update({
        where: { id: existing.id },
        data: {
          apiKey: data.apiKey,
          apiSecret: data.apiKey2,
          accountId: data.accountId,
          baseUrl: data.baseUrl,
          testMode: data.testMode,
          config: configJson,
        },
      })
    } else {
      await prisma.courierIntegration.create({
        data: {
          name: 'AMEEX',
          isActive: true,
          apiKey: data.apiKey,
          apiSecret: data.apiKey2,
          accountId: data.accountId,
          baseUrl: data.baseUrl,
          testMode: data.testMode,
          config: configJson,
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[AMEEX Config] Error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
