export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { Prisma, ProductStatus } from '@prisma/client'
import { calculateCommission, getCommissionRate, round2 } from '@/lib/utils/commission'

/**
 * GET /api/catalog — catalogue destiné aux revendeurs (§5.3).
 *
 * Ne renvoie que des produits actifs, et enrichit chaque ligne :
 *   - prix fournisseur ;
 *   - commission plateforme applicable au prix de gros ;
 *   - marge brute estimée pour le prix de revente saisi par le revendeur
 *     (ou un prix de revente suggéré à +40 %, marge brute nulle).
 *
 * Filtres : recherche, catégorie, fournisseur, prix minimum / maximum, tri.
 */
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 60)
    const search = searchParams.get('search') || ''
    const categoryId = searchParams.get('categoryId') || ''
    const supplierId = searchParams.get('supplierId') || ''
    const minPrice = searchParams.get('minPrice')
    const maxPrice = searchParams.get('maxPrice')
    const sort = searchParams.get('sort') || 'recent'
    /** Prix de revente saisi par le revendeur, pour estimer la marge. */
    const resalePrice = searchParams.get('resalePrice')

    const where: Prisma.ProductWhereInput = { status: ProductStatus.ACTIVE }

    if (categoryId) where.categoryId = categoryId
    if (supplierId) where.supplierId = supplierId
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { shortDescription: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (minPrice || maxPrice) {
      where.supplierPrice = {
        ...(minPrice ? { gte: Number(minPrice) } : {}),
        ...(maxPrice ? { lte: Number(maxPrice) } : {}),
      }
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      sort === 'price_asc'
        ? [{ supplierPrice: 'asc' }]
        : sort === 'price_desc'
          ? [{ supplierPrice: 'desc' }]
          : sort === 'name'
            ? [{ name: 'asc' }]
            : [{ isFeatured: 'desc' }, { createdAt: 'desc' }]

    const [products, total, commissionRate] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          supplier: { select: { id: true, companyName: true, city: true, isVerified: true } },
          images: { where: { isPrimary: true }, take: 1 },
          variants: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              value: true,
              additionalPrice: true,
              stock: true,
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
      getCommissionRate(),
    ])

    // Prix de revente : celui demandé par le revendeur, sinon une suggestion à
    // +40 % qui laisse une marge brute confortable.
    const resale = resalePrice ? Number(resalePrice) : null

    const items = products.map((product) => {
      const suggestedResellerPrice = round2(Number(product.supplierPrice) * 1.4)
      const effectiveResellerPrice = resale && resale > 0 ? resale : suggestedResellerPrice

      const calc = calculateCommission({
        commissionRate,
        supplierPrice: Number(product.supplierPrice),
        resellerPrice: effectiveResellerPrice,
        shippingFee: 0,
        currency: product.currency,
      })

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        shortDescription: product.shortDescription,
        category: product.category,
        supplier: product.supplier,
        image: product.images[0]?.url ?? null,
        supplierPrice: Number(product.supplierPrice),
        currency: product.currency,
        productionDays: product.productionDays,
        weight: product.weight ? Number(product.weight) : null,
        variants: product.variants.map((variant) => ({
          ...variant,
          additionalPrice: Number(variant.additionalPrice),
        })),
        pricing: {
          suggestedResellerPrice,
          resellerPrice: effectiveResellerPrice,
          commissionRate,
          commissionAmount: calc.commissionAmount,
          grossMargin: calc.resellerMargin,
          netMargin: calc.netResellerMargin,
          grossMarginPercent: calc.resellerMarginPercent,
        },
      }
    })

    return NextResponse.json({
      products: items,
      commissionRate,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[Catalog GET] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du catalogue' },
      { status: 500 }
    )
  }
}