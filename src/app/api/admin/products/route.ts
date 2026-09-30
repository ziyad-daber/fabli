export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { ProductStatus } from '@prisma/client'
import { z } from 'zod'

// GET /api/admin/products - List products with filters
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
    const status = searchParams.get('status') || undefined
    const categoryId = searchParams.get('categoryId') || undefined

    // Calculate skip for pagination
    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}

    // Search by name or slug
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { shortDescription: { contains: search, mode: 'insensitive' } }
      ]
    }

    // Filter by status
    if (status && Object.values(ProductStatus).includes(status as ProductStatus)) {
      where.status = status as ProductStatus
    }

    // Filter by category
    if (categoryId) {
      where.categoryId = categoryId
    }

    // Get products with pagination
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          },
          supplier: {
            select: {
              id: true,
              companyName: true
            }
          },
          images: {
            take: 1, // Get first image for preview
            select: {
              id: true,
              url: true,
              isPrimary: true
            }
          },
          variants: {
            select: {
              id: true,
              name: true,
              value: true,
              additionalPrice: true,
              stock: true,
              isActive: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.product.count({ where })
    ])

    return NextResponse.json({
      products,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('[Admin Products GET] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des produits' },
      { status: 500 }
    )
  }
}

// POST /api/admin/products - Create new product
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
      name: z.string().min(3, 'Le nom doit contenir au moins 3 caractères').max(100),
      slug: z.string().min(3, 'Le slug doit contenir au moins 3 caractères').max(100).regex(/^[a-z0-9-]+$/, 'Slug invalide (lettres minuscules, chiffres, tirets uniquement)'),
      categoryId: z.string().min(1, 'Veuillez sélectionner une catégorie'),
      supplierId: z.string().min(1, 'Veuillez sélectionner un fournisseur'),
      description: z.string().min(20, 'La description doit contenir au moins 20 caractères'),
      shortDescription: z.string().max(200).optional(),
      supplierPrice: z.coerce.number().min(0.01, 'Le prix doit être supérieur à 0'),
      currency: z.string().default('MAD'),
      productionDays: z.coerce.number().min(1, 'Minimum 1 jour').max(60, 'Maximum 60 jours'),
      weight: z.coerce.number().min(0).optional(),
      length: z.coerce.number().min(0).optional(),
      width: z.coerce.number().min(0).optional(),
      height: z.coerce.number().min(0).optional(),
      status: z.enum(['DRAFT', 'ACTIVE', 'DISABLED']).default('DRAFT'),
      isFeatured: z.boolean().default(false),
    })

    const validation = schema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const {
      name,
      slug,
      categoryId,
      supplierId,
      description,
      shortDescription,
      supplierPrice,
      currency,
      productionDays,
      weight,
      length,
      width,
      height,
      status,
      isFeatured
    } = validation.data

    // Slug uniqueness is scoped to the supplier, per the schema
    const existingSlug = await prisma.product.findFirst({
      where: { slug, supplierId },
    })

    if (existingSlug) {
      return NextResponse.json(
        { error: 'Ce slug existe déjà pour ce fournisseur' },
        { status: 400 }
      )
    }

    // The supplier must exist
    const supplier = await prisma.supplierProfile.findUnique({
      where: { id: supplierId },
      select: { id: true, companyName: true },
    })

    if (!supplier) {
      return NextResponse.json(
        { error: "Fournisseur introuvable. Veuillez sélectionner un fournisseur existant." },
        { status: 400 }
      )
    }

    // Create product
    const product = await prisma.product.create({
      data: {
        name,
        slug,
        categoryId,
        supplierId: supplier.id,
        description,
        shortDescription,
        supplierPrice,
        currency,
        productionDays,
        weight: weight || undefined,
        length: length || undefined,
        width: width || undefined,
        height: height || undefined,
        status,
        isFeatured,
        publishedAt: status === 'ACTIVE' ? new Date() : null
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        supplier: {
          select: {
            id: true,
            companyName: true
          }
        }
      }
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    console.error('[Admin Products POST] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création du produit' },
      { status: 500 }
    )
  }
}
