export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password'
import { audit, getRequestMeta } from '@/lib/utils/audit'

/**
 * /api/profile — consultation et mise à jour du profil (§5.1 « modification
 * du profil », §5.2 « profil professionnel et adresses de ramassage »).
 *
 * Un seul formulaire pour les deux rôles : les champs communs sont appliqués
 * au bon profil selon le rôle de l'utilisateur.
 */

const profileSchema = z.object({
  companyName: z.string().min(2, 'Raison sociale requise').max(150),
  contactName: z.string().min(2, 'Nom du contact requis').max(120),
  phone: z.string().min(8, 'Téléphone requis').max(30),
  address: z.string().min(5, 'Adresse requise').max(400),
  city: z.string().min(2, 'Ville requise').max(120),
  postalCode: z.string().max(20).optional(),
  ice: z.string().max(40).optional(),
  rc: z.string().max(40).optional(),
  email: z.string().email('Email invalide').optional(),
})

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        supplierProfile: true,
        resellerProfile: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
    }

    return NextResponse.json({ profile: user })
  } catch (error) {
    console.error('[Profile GET] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = await request.json()
    const validation = profileSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const data = validation.data
    const userId = session.user.id

    // Changement d'e-mail : unicité vérifiée avant écriture.
    if (data.email && data.email.toLowerCase() !== session.user.email) {
      const taken = await prisma.user.findFirst({
        where: { email: data.email.toLowerCase(), NOT: { id: userId } },
        select: { id: true },
      })
      if (taken) {
        return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 })
      }
    }

    const profileData = {
      companyName: data.companyName,
      contactName: data.contactName,
      phone: data.phone,
      address: data.address,
      city: data.city,
      postalCode: data.postalCode || null,
      ice: data.ice || null,
      rc: data.rc || null,
    }

    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { id: userId },
        select: { supplierProfile: true, resellerProfile: true },
      })

      if (data.email) {
        await tx.user.update({ where: { id: userId }, data: { email: data.email.toLowerCase() } })
      }

      if (session.user.role === 'SUPPLIER') {
        if (!existing?.supplierProfile) {
          // Un compte fournisseur sans profil ne peut pas vendre : on le crée
          // pour ne pas bloquer l'utilisateur.
          await tx.supplierProfile.create({ data: { userId, ...profileData } })
        } else {
          await tx.supplierProfile.update({
            where: { id: existing.supplierProfile.id },
            data: profileData,
          })
        }
      } else if (session.user.role === 'RESELLER') {
        if (!existing?.resellerProfile) {
          await tx.resellerProfile.create({ data: { userId, ...profileData } })
        } else {
          await tx.resellerProfile.update({
            where: { id: existing.resellerProfile.id },
            data: profileData,
          })
        }
      }

      return tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          role: true,
          supplierProfile: true,
          resellerProfile: true,
        },
      })
    })

    await audit({
      userId,
      action: 'PROFILE_UPDATED',
      entityType: 'User',
      entityId: userId,
      newData: { companyName: data.companyName, city: data.city },
      ...getRequestMeta(request),
    })

    return NextResponse.json({ success: true, user })
  } catch (error) {
    console.error('[Profile PUT] Error:', error)
    return NextResponse.json({ error: 'Erreur lors de la mise à jour du profil' }, { status: 500 })
  }
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
  newPassword: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
})

/** PUT /api/profile — changement de mot de passe par l'utilisateur connecté. */
export async function PATCH(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = await request.json()
    const validation = passwordSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const strength = validatePasswordStrength(validation.data.newPassword)
    if (!strength.valid) {
      return NextResponse.json({ error: strength.errors.join(', ') }, { status: 400 })
    }

    const { verifyPassword } = await import('@/lib/auth/password')
    const user = await prisma.user.findUnique({ where: { id: session.user.id } })
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
    }

    if (!(await verifyPassword(validation.data.currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: 'Mot de passe actuel incorrect' }, { status: 403 })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(validation.data.newPassword),
        failedLogins: 0,
        lockedUntil: null,
      },
    })

    // Un changement de mot de passe invalide les jetons de réinitialisation
    // encore ouverts.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    })

    await audit({
      userId: user.id,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: user.id,
      ...getRequestMeta(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Profile PATCH] Error:', error)
    return NextResponse.json({ error: 'Erreur lors du changement de mot de passe' }, { status: 500 })
  }
}