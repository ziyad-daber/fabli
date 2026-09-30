import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { hashPassword } from '@/lib/auth/password'
import { UserRole, UserStatus } from '@prisma/client'
import { checkRateLimit, clientIdentifier, rateLimitHeaders } from '@/lib/utils/rate-limit'

/** Champs acceptés à l'inscription (§5.1, §5.2, §5.3). */
const registerSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  role: z.enum(['SUPPLIER', 'RESELLER']),
  companyName: z.string().min(2, 'Raison sociale requise').max(150),
  contactName: z.string().min(2, 'Nom du contact requis').max(120),
  phone: z.string().min(8, 'Téléphone requis').max(30),
  address: z.string().min(5, 'Adresse requise').max(400),
  city: z.string().min(2, 'Ville requise').max(120),
  postalCode: z.string().max(20).optional(),
  ice: z.string().max(40).optional(),
  rc: z.string().max(40).optional(),
})

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(clientIdentifier(request, 'register'), 5, 60 * 60 * 1000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Trop de créations de compte depuis cette source. Réessayez plus tard.' },
      { status: 429, headers: rateLimitHeaders(limit) }
    )
  }

  try {
    const body = await request.json()
    const validation = registerSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const data = validation.data
    const email = data.email.toLowerCase()

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return NextResponse.json(
        { error: 'Un compte avec cet email existe déjà' },
        { status: 409, headers: rateLimitHeaders(limit) }
      )
    }

    // Le compte démarre en attente de validation : seul un administrateur
    // l'active (§5.1, et `authorize` refuse tout autre statut).
    const passwordHash = await hashPassword(data.password)
    const profileData = {
      companyName: data.companyName,
      contactName: data.contactName,
      phone: data.phone,
      address: data.address,
      city: data.city,
      postalCode: data.postalCode || null,
      ice: data.ice || null,
      rc: data.rc || null,
      isVerified: false,
    }

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: data.role as UserRole,
          status: UserStatus.PENDING_VERIFICATION,
        },
      })

      if (data.role === 'SUPPLIER') {
        await tx.supplierProfile.create({ data: { userId: user.id, ...profileData } })
      } else {
        await tx.resellerProfile.create({ data: { userId: user.id, ...profileData } })
      }
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Compte créé. Il sera actif après validation par un administrateur.',
      },
      { status: 201, headers: rateLimitHeaders(limit) }
    )
  } catch (error) {
    console.error('[Registration] Error:', error)
    return NextResponse.json(
      { error: "Erreur serveur lors de l'inscription" },
      { status: 500 }
    )
  }
}