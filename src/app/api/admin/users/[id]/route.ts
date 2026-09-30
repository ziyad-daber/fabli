export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'

type RouteContext = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  email: z.string().email('Email invalide').optional(),
  role: z.enum(['ADMIN', 'SUPPLIER', 'RESELLER']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION']).optional(),
})

// GET /api/admin/users/[id] - Get a single user
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Non autorisé - Réservé aux administrateurs' },
        { status: 403 }
      )
    }

    const { id } = await params

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        supplierProfile: true,
        resellerProfile: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
    }

    return NextResponse.json(user)
  } catch (error) {
    console.error('[Admin Users GET by id] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// PATCH /api/admin/users/[id] - Update user
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Non autorisé - Réservé aux administrateurs' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json()

    const validation = updateSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { email, role, status } = validation.data

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { id } })

    if (!existingUser) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
    }

    // Check if email is already taken by another user
    if (email && email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({ where: { email } })

      if (emailExists) {
        return NextResponse.json(
          { error: 'Cet email est déjà utilisé par un autre utilisateur' },
          { status: 400 }
        )
      }
    }

    // Update user
    const updateData: any = {}
    if (email) updateData.email = email
    if (role) updateData.role = role
    if (status) updateData.status = status

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        emailVerified: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error('[Admin Users PATCH] Error:', error)
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de l'utilisateur" },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/users/[id] - Delete user
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Non autorisé - Réservé aux administrateurs' },
        { status: 403 }
      )
    }

    const { id } = await params

    const existingUser = await prisma.user.findUnique({ where: { id } })

    if (!existingUser) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
    }

    // Prevent deleting yourself
    if (existingUser.id === session.user.id) {
      return NextResponse.json(
        { error: 'Vous ne pouvez pas supprimer votre propre compte' },
        { status: 400 }
      )
    }

    // Refuse to delete a user whose supplier/reseller profile still has orders attached.
    // Order.supplierId / Order.resellerId reference profile ids, not user ids.
    const [supplierProfile, resellerProfile] = await Promise.all([
      prisma.supplierProfile.findUnique({ where: { userId: id }, select: { id: true } }),
      prisma.resellerProfile.findUnique({ where: { userId: id }, select: { id: true } }),
    ])

    const profileIds = [supplierProfile?.id, resellerProfile?.id].filter(
      (value): value is string => typeof value === 'string'
    )

    if (profileIds.length > 0) {
      const orderCount = await prisma.order.count({
        where: {
          OR: [{ supplierId: { in: profileIds } }, { resellerId: { in: profileIds } }],
        },
      })

      if (orderCount > 0) {
        return NextResponse.json(
          { error: 'Impossible de supprimer cet utilisateur : des commandes lui sont rattachées' },
          { status: 400 }
        )
      }
    }

    await prisma.user.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin Users DELETE] Error:', error)
    return NextResponse.json(
      { error: "Erreur lors de la suppression de l'utilisateur" },
      { status: 500 }
    )
  }
}
