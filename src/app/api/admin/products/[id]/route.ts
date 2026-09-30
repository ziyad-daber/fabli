export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'

type RouteContext = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  name: z
    .string()
    .min(3, 'Le nom doit contenir au moins 3 caractères')
    .max(100)
    .optional(),
  slug: z
    .string()
    .min(3, 'Le slug doit contenir au moins 3 caractères')
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug invalide (lettres minuscules, chiffres, tirets uniquement)')
    .optional(),
  categoryId: z.string().min(1, 'Veuillez sélectionner une catégorie').optional(),
  description: z
    .string()
    .min(20, 'La description doit contenir au moins 20 caractères')
    .optional(),
  shortDescription: z.string().max(200).optional(),
  supplierId: z.string().min(1, 'Veuillez sélectionner un fournisseur').optional(),
  supplierPrice: z.coerce.number().min(0.01, 'Le prix doit être supérieur à 0').optional(),
  currency: z.string().optional(),
  productionDays: z.coerce.number().min(1, 'Minimum 1 jour').max(60, 'Maximum 60 jours').optional(),
  weight: z.coerce.number().min(0).optional(),
  length: z.coerce.number().min(0).optional(),
  width: z.coerce.number().min(0).optional(),
  height: z.coerce.number().min(0).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'DISABLED']).optional(),
  isFeatured: z.boolean().optional(),
})

// PATCH /api/admin/products/[id] - Update product
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

    const {
      name,
      slug,
      categoryId,
      description,
      shortDescription,
      supplierId,
      supplierPrice,
      currency,
      productionDays,
      weight,
      length,
      width,
      height,
      status,
      isFeatured,
    } = validation.data

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({ where: { id } })

    if (!existingProduct) {
      return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })
    }

    // Slugs are only unique per supplier, so scope the duplicate check accordingly
    const targetSupplierId = supplierId ?? existingProduct.supplierId

    if (slug && (slug !== existingProduct.slug || supplierId)) {
      const existingSlug = await prisma.product.findFirst({
        where: { slug, supplierId: targetSupplierId, NOT: { id } },
      })

      if (existingSlug) {
        return NextResponse.json(
          { error: 'Ce slug existe déjà pour ce fournisseur' },
          { status: 400 }
        )
      }
    }

    // Update product
    const updateData: any = {}
    if (name) updateData.name = name
    if (slug) updateData.slug = slug
    if (categoryId) updateData.categoryId = categoryId
    if (description) updateData.description = description
    if (shortDescription !== undefined) updateData.shortDescription = shortDescription
    if (supplierId) updateData.supplierId = supplierId
    if (supplierPrice) updateData.supplierPrice = supplierPrice
    if (currency) updateData.currency = currency
    if (productionDays) updateData.productionDays = productionDays
    if (weight !== undefined) updateData.weight = weight
    if (length !== undefined) updateData.length = length
    if (width !== undefined) updateData.width = width
    if (height !== undefined) updateData.height = height
    if (status) updateData.status = status
    if (isFeatured !== undefined) updateData.isFeatured = isFeatured
    if (status === 'ACTIVE' && !existingProduct.publishedAt) {
      updateData.publishedAt = new Date()
    }

    const product = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        supplier: { select: { id: true, companyName: true } },
      },
    })

    return NextResponse.json(product)
  } catch (error) {
    console.error('[Admin Products PATCH] Error:', error)
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du produit" },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/products/[id] - Delete product
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

    const existingProduct = await prisma.product.findUnique({ where: { id } })

    if (!existingProduct) {
      return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })
    }

    // Check if product has order items (cannot delete if used in orders)
    const orderItemCount = await prisma.orderItem.count({ where: { productId: id } })

    if (orderItemCount > 0) {
      return NextResponse.json(
        { error: 'Impossible de supprimer ce produit car il est utilisé dans des commandes' },
        { status: 400 }
      )
    }

    // Delete product (cascade will delete images and variants)
    await prisma.product.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin Products DELETE] Error:', error)
    return NextResponse.json(
      { error: "Erreur lors de la suppression du produit" },
      { status: 500 }
    )
  }
}
