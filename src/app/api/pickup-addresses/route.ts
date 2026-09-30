export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveCity } from '@/lib/ameex/cities'

/**
 * /api/pickup-addresses — adresses de ramassage du fournisseur (§5.2).
 * Le fournisseur n'a jamais à saisir de configuration transporteur : ces
 * adresses servent uniquement à renseigner les expéditions (§6.3).
 */

const addressSchema = z.object({
  name: z.string().min(2, "Nom de l'adresse requis").max(120),
  contactName: z.string().min(2, 'Nom du contact requis').max(120),
  phone: z.string().min(8, 'Téléphone du contact requis').max(30),
  address: z.string().min(5, 'Adresse complète requise').max(400),
  city: z.string().min(2, 'Ville requise').max(120),
  postalCode: z.string().max(20).optional(),
  isDefault: z.boolean().default(false),
})

async function requireSupplier() {
  const session = await auth()
  if (!session?.user) return { error: 'Non autorisé', status: 401 } as const
  if (session.user.role !== 'SUPPLIER' && session.user.role !== 'ADMIN') {
    return { error: 'Non autorisé - Réservé aux fournisseurs', status: 403 } as const
  }
  if (session.user.role === 'SUPPLIER' && !session.user.supplierProfile?.id) {
    return { error: 'Profil fournisseur introuvable', status: 403 } as const
  }
  return { session } as const
}

export async function GET(request: Request) {
  try {
    const guard = await requireSupplier()
    if ('error' in guard) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }

    // L'administrateur liste les adresses d'un fournisseur donné.
    const supplierId =
      guard.session.user.role === 'ADMIN'
        ? new URL(request.url).searchParams.get('supplierId') ?? ''
        : guard.session.user.supplierProfile!.id

    if (!supplierId) {
      return NextResponse.json({ error: 'supplierId requis' }, { status: 400 })
    }

    const addresses = await prisma.pickupAddress.findMany({
      where: { supplierId },
      include: { ameexCity: { select: { id: true, name: true, ameexId: true } } },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    })

    return NextResponse.json({ addresses })
  } catch (error) {
    console.error('[Pickup addresses GET] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const guard = await requireSupplier()
    if ('error' in guard) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }

    const body = await request.json()
    const validation = addressSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const data = validation.data
    const supplierId =
      guard.session.user.role === 'ADMIN'
        ? (body.supplierId as string | undefined) ?? ''
        : guard.session.user.supplierProfile!.id

    if (!supplierId) {
      return NextResponse.json({ error: 'supplierId requis' }, { status: 400 })
    }

    // La ville est rattachée à un identifiant AMEEX quand c'est possible ; sinon
    // `cityId` reste nul et la création d'expédition le signalera.
    const city = await resolveCity(data.city)

    const address = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.pickupAddress.updateMany({
          where: { supplierId },
          data: { isDefault: false },
        })
      }
      return tx.pickupAddress.create({
        data: {
          supplierId,
          name: data.name,
          contactName: data.contactName,
          phone: data.phone,
          address: data.address,
          city: data.city,
          cityId: city?.id ?? null,
          postalCode: data.postalCode || null,
          isDefault: data.isDefault,
        },
        include: { ameexCity: true },
      })
    })

    return NextResponse.json(address, { status: 201 })
  } catch (error) {
    console.error('[Pickup addresses POST] Error:', error)
    return NextResponse.json({ error: "Erreur lors de l'enregistrement" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const guard = await requireSupplier()
    if ('error' in guard) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }

    const body = await request.json()
    const validation = addressSchema.extend({ id: z.string().min(1) }).safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { id, ...data } = validation.data
    const supplierId =
      guard.session.user.role === 'ADMIN'
        ? (body.supplierId as string | undefined) ?? ''
        : guard.session.user.supplierProfile!.id

    const existing = await prisma.pickupAddress.findFirst({ where: { id, supplierId } })
    if (!existing) {
      return NextResponse.json({ error: 'Adresse introuvable' }, { status: 404 })
    }

    const city = await resolveCity(data.city)

    const updated = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.pickupAddress.updateMany({
          where: { supplierId, NOT: { id } },
          data: { isDefault: false },
        })
      }
      return tx.pickupAddress.update({
        where: { id },
        data: {
          name: data.name,
          contactName: data.contactName,
          phone: data.phone,
          address: data.address,
          city: data.city,
          cityId: city?.id ?? null,
          postalCode: data.postalCode || null,
          isDefault: data.isDefault,
        },
        include: { ameexCity: true },
      })
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[Pickup addresses PUT] Error:', error)
    return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const guard = await requireSupplier()
    if ('error' in guard) {
      return NextResponse.json({ error: guard.error }, { status: guard.status })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    const supplierId =
      guard.session.user.role === 'ADMIN'
        ? (searchParams.get('supplierId') ?? '')
        : guard.session.user.supplierProfile!.id

    const existing = await prisma.pickupAddress.findFirst({ where: { id, supplierId } })
    if (!existing) {
      return NextResponse.json({ error: 'Adresse introuvable' }, { status: 404 })
    }

    // Une adresse déjà utilisée par une commande ne disparaît pas de
    // l'historique : `Order.pickupAddressId` est en ON DELETE SET NULL.
    const usedBy = await prisma.order.count({ where: { pickupAddressId: id } })

await prisma.pickupAddress.delete({ where: { id } })

    return NextResponse.json({ success: true, ordersAffected: usedBy })
  } catch (error) {
    console.error('[Pickup addresses DELETE] Error:', error)
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 })
  }
}