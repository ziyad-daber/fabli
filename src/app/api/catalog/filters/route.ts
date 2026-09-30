export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { ProductStatus } from '@prisma/client'

/**
 * GET /api/catalog/filters — valeurs possibles des filtres du catalogue :
 * catégories actives, fournisseurs publiés, bornes de prix.
 * Chargé une fois pour alimenter les menus de filtrage du revendeur (§5.3).
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const [categories, suppliers, aggregate] = await Promise.all([
      prisma.category.findMany({
        where: { isActive: true },
        select: { id: true, name: true, slug: true, _count: { select: { products: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.supplierProfile.findMany({
        where: { products: { some: { status: ProductStatus.ACTIVE } } },
        select: {
          id: true,
          companyName: true,
          city: true,
          _count: { select: { products: true } },
        },
        orderBy: { companyName: 'asc' },
      }),
      prisma.product.aggregate({
        where: { status: ProductStatus.ACTIVE },
        _min: { supplierPrice: true },
        _max: { supplierPrice: true },
      }),
    ])

    return NextResponse.json({
      categories,
      suppliers,
      priceRange: {
        min: aggregate._min.supplierPrice ? Number(aggregate._min.supplierPrice) : 0,
        max: aggregate._max.supplierPrice ? Number(aggregate._max.supplierPrice) : 0,
      },
    })
  } catch (error) {
    console.error('[Catalog filters GET] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}