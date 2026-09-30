export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password'
import { notifyPasswordReset } from '@/lib/notifications/service'
import { audit, getRequestMeta } from '@/lib/utils/audit'
import { checkRateLimit, clientIdentifier, rateLimitHeaders } from '@/lib/utils/rate-limit'

/**
 * /api/auth/forgot-password — réinitialisation du mot de passe (§5.1).
 *
 * La réponse est volontairement identique que l'adresse existe ou non :
 * divulguer quels e-mails sont enregistrés est une fuite d'information.
 *
 * Seul le hachage SHA-256 du jeton est stocké, et il est à usage unique avec
 * une durée de vie courte.
 */

const RESET_TTL_MINUTES = 60

const forgotSchema = z.object({
  email: z.string().email('Email invalide'),
})

export async function POST(request: Request) {
  const limit = checkRateLimit(clientIdentifier(request, 'forgot-password'), 5, 15 * 60 * 1000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Trop de demandes. Réessayez dans quelques minutes.' },
      { status: 429, headers: rateLimitHeaders(limit) }
    )
  }

  try {
    const body = await request.json()
    const validation = forgotSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
    }

    const email = validation.data.email.toLowerCase()
    const user = await prisma.user.findUnique({ where: { email } })

    const genericResponse = NextResponse.json(
      {
        success: true,
        message:
          "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé.",
      },
      { headers: rateLimitHeaders(limit) }
    )

    if (!user) return genericResponse

    // Purge des jetons expirés ou déjà utilisés pour ce compte.
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, OR: [{ usedAt: { not: null } }, { expiresAt: { lt: new Date() } }] },
    })

    const token = randomBytes(32).toString('hex')
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
      },
    })

    const baseUrl = process.env.NEXTAUTH_URL || new URL(request.url).origin
    await notifyPasswordReset(user.email, `${baseUrl}/auth/reset-password?token=${token}`)

    await audit({
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'User',
      entityId: user.id,
      ...getRequestMeta(request),
    })

    return genericResponse
  } catch (error) {
    console.error('[Forgot password] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

const resetSchema = z.object({
  token: z.string().min(32, 'Jeton invalide'),
  newPassword: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
})

/** PUT /api/auth/forgot-password — consommation du jeton et nouveau mot de passe. */
export async function PUT(request: Request) {
  const limit = checkRateLimit(clientIdentifier(request, 'reset-password'), 10, 15 * 60 * 1000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
      { status: 429, headers: rateLimitHeaders(limit) }
    )
  }

  try {
    const body = await request.json()
    const validation = resetSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { token, newPassword } = validation.data
    const tokenHash = createHash('sha256').update(token).digest('hex')

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true } } },
    })

    const invalid = NextResponse.json(
      { error: 'Ce lien est invalide ou a expiré. Demandez-en un nouveau.' },
      { status: 400 }
    )

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return invalid
    }

    const strength = validatePasswordStrength(newPassword)
    if (!strength.valid) {
      return NextResponse.json({ error: strength.errors.join(', ') }, { status: 400 })
    }

    const passwordHash = await hashPassword(newPassword)

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          // Un nouveau mot de passe doit démarrer une série d'échecs à zéro.
          failedLogins: 0,
          lockedUntil: null,
        },
      })
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      })
      // Les autres jetons de ce compte deviennent inutilisables.
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      })
    })

    await audit({
      userId: record.userId,
      action: 'PASSWORD_RESET_COMPLETED',
      entityType: 'User',
      entityId: record.userId,
      ...getRequestMeta(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Reset password] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}