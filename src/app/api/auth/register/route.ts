import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password'
import { UserRole, UserStatus } from '@prisma/client'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      email,
      password,
      role,
      companyName,
      contactName,
      phone,
      address,
      city,
      postalCode,
      ice,
      rc,
    } = body

    // Validate required fields
    if (!email || !password || !role || !companyName || !contactName || !phone || !address || !city) {
      return NextResponse.json(
        { error: 'Tous les champs obligatoires doivent être remplis' },
        { status: 400 }
      )
    }

    // Validate role
    if (!['SUPPLIER', 'RESELLER'].includes(role)) {
      return NextResponse.json(
        { error: 'Rôle invalide' },
        { status: 400 }
      )
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password)
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.errors.join(', ') },
        { status: 400 }
      )
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Un compte avec cet email existe déjà' },
        { status: 409 }
      )
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create user and profile in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          role: role as UserRole,
          status: UserStatus.PENDING_VERIFICATION,
        },
      })

      if (role === 'SUPPLIER') {
        await tx.supplierProfile.create({
          data: {
            userId: user.id,
            companyName,
            contactName,
            phone,
            address,
            city,
            postalCode,
            ice,
            rc,
            isVerified: false,
          },
        })
      } else {
        await tx.resellerProfile.create({
          data: {
            userId: user.id,
            companyName,
            contactName,
            phone,
            address,
            city,
            postalCode,
            ice,
            rc,
            isVerified: false,
          },
        })
      }

      return user
    })

    // TODO: Send verification email

    return NextResponse.json(
      { message: 'Compte créé avec succès. En attente de validation par un administrateur.' },
      { status: 201 }
    )
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur lors de l\'inscription' },
      { status: 500 }
    )
  }
}