export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { productInputSchema, slugify } from '@/lib/products/schema'
import { audit, getRequestMeta } from '@/lib/utils/audit'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function findAccessibleProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      supplier: { select: { id: true, companyName: true } },
      images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
      variants: { orderBy: { name: 'asc' } },
    },
  })
  if (!product) return { error: 'Produit introuvable', status: 404 } as const

  const session = await auth()
  if (!session?.user) return { error: 'Non autorisé', status: 401 } as const

  if (session.user.role === 'SUPPLIER' && product.supplierId !== session.user.supplierProfile?.id) {
    return { error: 'Accès refusé', status: 403 } as const
  }
  if (session.user.role === 'RESELLER' && product.status !== 'ACTIVE') {
    return { error: 'Produit introuvable', status: 404 } as const
  }

  return { product, session, status: 200 } as const
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const result = await findAccessibleProduct(id)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.product)
  } catch (error) {
    console.error('[Product GET] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const result = await findAccessibleProduct(id)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const { product, session } = result
    if (session.user.role === 'RESELLER') {
      return NextResponse.json(
        { error: 'Non autorisé - Les revendeurs ne modifient pas les produits' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validation = productInputSchema.partial().safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const data = validation.data
    const updates: Prisma.ProductUpdateInput = {}

    if (data.name !== undefined) updates.name = data.name
    if (data.description !== undefined) updates.description = data.description
    if (data.shortDescription !== undefined) updates.shortDescription = data.shortDescription
    if (data.supplierPrice !== undefined) updates.supplierPrice = data.supplierPrice
    if (data.currency !== undefined) updates.currency = data.currency
    if (data.productionDays !== undefined) updates.productionDays = data.productionDays
    if (data.weight !== undefined) updates.weight = data.weight
    if (data.length !== undefined) updates.length = data.length
    if (data.width !== undefined) updates.width = data.width
    if (data.height !== undefined) updates.height = data.height
    if (data.isFeatured !== undefined) updates.isFeatured = data.isFeatured

    if (data.categoryId !== undefined) {
      const category = await prisma.category.findUnique({
        where: { id: data.categoryId },
        select: { id: true },
      })
      if (!category) {
        return NextResponse.json({ error: 'Catégorie introuvable' }, { status: 400 })
      }
      updates.category = { connect: { id: data.categoryId } }
    }

    // Le fournisseur ne peut pas transférer son produit à un autre.
    if (data.supplierId !== undefined && session.user.role === 'ADMIN') {
      updates.supplier = { connect: { id: data.supplierId } }
    }

    if (data.slug !== undefined || data.name !== undefined) {
      const wanted = data.slug ?? slugify(data.name ?? product.name)
      const taken = await prisma.product.findFirst({
        where: { slug: wanted, supplierId: product.supplierId, NOT: { id: product.id } },
      })
      updates.slug = taken ? `${wanted}-${Date.now().toString(36).slice(-4)}` : wanted
    }

    if (data.status !== undefined) {
      updates.status = data.status
      updates.publishedAt = data.status === 'ACTIVE' ? (product.publishedAt ?? new Date()) : null
    }

    if (data.imageUrls) {
      updates.images = {
        deleteMany: {},
        create: data.imageUrls.map((url, index) => ({
          url,
          isPrimary: index === 0,
          sortOrder: index,
        })),
      }
    }

    const updated = await prisma.product.update({
      where: { id },
      data: updates,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: true,
        variants: true,
      },
    })

    await audit({
      userId: session.user.id,
      action: 'PRODUCT_UPDATED',
      entityType: 'Product',
      entityId: id,
      oldData: {
        name: product.name,
        supplierPrice: String(product.supplierPrice),
        status: product.status,
      },
      newData: { name: updated.name, supplierPrice: String(updated.supplierPrice), status: updated.status },
      ...getRequestMeta(request),
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[Product PATCH] Error:', error)
    return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 })
  }
}

/**
 * DELETE /api/products/[id] — suppression définitive, refusée si le produit
 * apparaît dans une commande. La désactivation (PATCH status=DISABLED) est la
 * façon normale de retirer un produit du catalogue.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const result = await findAccessibleProduct(id)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const { product, session } = result
    if (session.user.role === 'RESELLER') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    // Un produit référencé par une commande ne peut pas être supprimé : il
    // reste dans l'historique financier.
    const referenced = await prisma.orderItem.count({ where: { productId: id } })
    if (referenced > 0) {
      return NextResponse.json(
        {
          error: `Ce produit est référencé par ${referenced} ligne(s) de commande. Désactivez-le au lieu de le supprimer.`,
        },
        { status: 409 }
      )
    }

    await prisma.product.delete({ where: { id } })

    await audit({
      userId: session.user.id,
      action: 'PRODUCT_DELETED',
      entityType: 'Product',
      entityId: id,
      oldData: { name: product.name, supplierId: product.supplierId },
      ...getRequestMeta(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Product DELETE] Error:', error)
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 })
  }
}