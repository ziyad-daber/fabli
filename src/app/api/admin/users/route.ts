export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { UserRole, UserStatus } from '@prisma/client'
import { z } from 'zod'

// GET /api/admin/users - List users with filters
export async function GET(request: Request) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Non autorisé - Réservé aux administrateurs' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const search = searchParams.get('search') || ''
    const role = searchParams.get('role') || undefined
    const status = searchParams.get('status') || undefined

    // Calculate skip for pagination
    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}

    // Search by email
    if (search) {
      where.email = {
        contains: search,
        mode: 'insensitive',
      }
    }

    // Filter by role
    if (role && Object.values(UserRole).includes(role as UserRole)) {
      where.role = role as UserRole
    }

    // Filter by status
    if (status && Object.values(UserStatus).includes(status as UserStatus)) {
      where.status = status as UserStatus
    }

    // Get users with pagination
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          emailVerified: true,
          createdAt: true,
          lastLoginAt: true,
          supplierProfile: {
            select: {
              id: true,
              companyName: true,
              contactName: true,
              phone: true,
              address: true,
              city: true,
              postalCode: true,
              ice: true,
              rc: true,
              isVerified: true,
            },
          },
          resellerProfile: {
            select: {
              id: true,
              companyName: true,
              contactName: true,
              phone: true,
              address: true,
              city: true,
              postalCode: true,
              ice: true,
              rc: true,
              isVerified: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ])

    return NextResponse.json({
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[Admin Users GET] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des utilisateurs' },
      { status: 500 }
    )
  }
}

// POST /api/admin/users - Create new user
export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Non autorisé - Réservé aux administrateurs' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Validate input
    const schema = z.object({
      email: z.string().email('Email invalide'),
      role: z.enum(['ADMIN', 'SUPPLIER', 'RESELLER']),
      status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION']),
      password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères').optional(),
    })

    const validation = schema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { email, role, status, password } = validation.data

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Un utilisateur avec cet email existe déjà' },
        { status: 400 }
      )
    }

    // Hash password
    const { hashPassword } = await import('@/lib/auth/password')
    const passwordHash = await hashPassword(password || Math.random().toString(36).slice(-8))

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        role,
        status,
        passwordHash,
        emailVerified: new Date(), // Auto-verify for admin-created users
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        emailVerified: true,
        createdAt: true,
      },
    })

    return NextResponse.json(user, { status: 201 })
  } catch (error) {
    console.error('[Admin Users POST] Error:', error)
    return NextResponse.json(
      { error: "Erreur lors de la création de l'utilisateur" },
      { status: 500 }
    )
  }
}
