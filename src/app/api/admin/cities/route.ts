export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * /api/admin/cities — référentiel villes.
 *
 * L'API AMEEX exige un identifiant de ville, pas un nom : cette table fait
 * la traduction. Sans correspondance, la création d'expédition est refusée
 * avec un message explicite plutôt que d'envoyer une donnée invalide au
 * transporteur.
 */

const citySchema = z.object({
  name: z.string().min(2, 'Nom de ville requis').max(80),
  ameexId: z.string().min(1, 'Identifiant AMEEX requis').max(40),
  isActive: z.boolean().default(true),
})

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''

    const cities = await prisma.city.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : undefined,
      include: { _count: { select: { orders: true, pickupAddresses: true } } },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ cities })
  } catch (error) {
    console.error('[Cities GET] Error:', error)
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
    const validation = citySchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { name, ameexId, isActive } = validation.data

    const existing = await prisma.city.findFirst({
      where: { OR: [{ name }, { ameexId }] },
      select: { id: true, name: true, ameexId: true },
    })

    // Un même nom avec un identifiant différent est une correction ;
    // deux villes partageant le même identifiant AMEEX seraient ambiguës.
    if (existing) {
      const updated = await prisma.city.update({
        where: { id: existing.id },
        data: { name, ameexId, isActive },
      })
      return NextResponse.json(updated)
    }

    const city = await prisma.city.create({ data: { name, ameexId, isActive } })
    return NextResponse.json(city, { status: 201 })
  } catch (error) {
    console.error('[Cities POST] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const id = new URL(request.url).searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    // La ville est référencée par des commandes : la désactiver suffit.
    const used = await prisma.order.count({ where: { deliveryCityId: id } })
    if (used > 0) {
      const city = await prisma.city.update({ where: { id }, data: { isActive: false } })
      return NextResponse.json({
        success: true,
        deactivated: true,
        city,
        message: `Ville utilisée par ${used} commande(s) : elle a été désactivée plutôt que supprimée.`,
      })
    }

    await prisma.city.delete({ where: { id } })
    return NextResponse.json({ success: true, deactivated: false })
  } catch (error) {
    console.error('[Cities DELETE] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}