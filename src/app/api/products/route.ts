export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { Prisma, ProductStatus } from '@prisma/client'
import { audit, getRequestMeta } from '@/lib/utils/audit'
import { productInputSchema, slugify } from '@/lib/products/schema'

/**
 * /api/products — catalogue et gestion des produits (§5.2, §5.4).
 *
 * Périmètre par rôle :
 *  - ADMIN      : tous les produits, création et modération ;
 *  - SUPPLIER   : uniquement ses propres produits ;
 *  - RESELLER   : uniquement les produits actifs, en lecture.
 *
 * Le revendeur ne passe pas par cette route pour consulter le catalogue : il
 * utilise /api/catalog, qui enrichit chaque ligne de la marge estimée.
 */

/** GET /api/products — liste paginée, filtrée par le rôle demandeur. */
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || undefined
    const categoryId = searchParams.get('categoryId') || undefined

    const where: Prisma.ProductWhereInput = {}

    if (session.user.role === 'SUPPLIER') {
      where.supplierId = session.user.supplierProfile?.id ?? '__none__'
    } else if (session.user.role === 'RESELLER') {
      // Le revendeur ne voit que l'offre publiée.
      where.status = ProductStatus.ACTIVE
    } else if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Rôle non autorisé' }, { status: 403 })
    }

    if (status && Object.values(ProductStatus).includes(status as ProductStatus)) {
      where.status = status as ProductStatus
    }
    if (categoryId) where.categoryId = categoryId
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { shortDescription: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          supplier: { select: { id: true, companyName: true, isVerified: true } },
          images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
          variants: { where: { isActive: true }, orderBy: { name: 'asc' } },
        },
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ])

    return NextResponse.json({
      products,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[Products GET] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des produits' },
      { status: 500 }
    )
  }
}

/** POST /api/products — création. */
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const role = session.user.role
    if (role !== 'SUPPLIER' && role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Non autorisé - Réservé aux fournisseurs et administrateurs' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validation = productInputSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const data = validation.data

    // Un fournisseur publie pour son propre compte, sans avoir à le choisir.
    const supplierId =
      role === 'SUPPLIER' ? session.user.supplierProfile?.id : data.supplierId

    if (!supplierId) {
      return NextResponse.json(
        { error: 'Aucun profil fournisseur associé à votre compte' },
        { status: 400 }
      )
    }

    const supplier = await prisma.supplierProfile.findUnique({
      where: { id: supplierId },
      select: { id: true, companyName: true },
    })
    if (!supplier) {
      return NextResponse.json({ error: 'Fournisseur introuvable' }, { status: 400 })
    }

    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
      select: { id: true },
    })
    if (!category) {
      return NextResponse.json({ error: 'Catégorie introuvable' }, { status: 400 })
    }

    // Le slug est unique par fournisseur (§11 : @@unique([supplierId, slug])).
    const baseSlug = data.slug || slugify(data.name)
    let slug = baseSlug
    for (let attempt = 1; attempt < 20; attempt++) {
      const taken = await prisma.product.findFirst({ where: { slug, supplierId } })
      if (!taken) break
      slug = `${baseSlug}-${attempt + 1}`
    }

    const product = await prisma.product.create({
      data: {
        name: data.name,
        slug,
        categoryId: data.categoryId,
        supplierId,
        description: data.description,
        shortDescription: data.shortDescription,
        supplierPrice: data.supplierPrice,
        currency: data.currency,
        productionDays: data.productionDays,
        weight: data.weight,
        length: data.length,
        width: data.width,
        height: data.height,
        status: data.status,
        isFeatured: data.isFeatured,
        publishedAt: data.status === 'ACTIVE' ? new Date() : null,
        images: {
          create: data.imageUrls.map((url, index) => ({
            url,
            isPrimary: index === 0,
            sortOrder: index,
          })),
        },
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: true,
        variants: true,
      },
    })

    await audit({
      userId: session.user.id,
      action: 'PRODUCT_CREATED',
      entityType: 'Product',
      entityId: product.id,
      newData: { name: product.name, supplierId, status: product.status },
      ...getRequestMeta(request),
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    console.error('[Products POST] Error:', error)
    return NextResponse.json(
      { error: "Erreur lors de la création du produit" },
      { status: 500 }
    )
  }
}