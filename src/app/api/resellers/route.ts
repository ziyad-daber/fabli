export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'

/**
 * GET /api/resellers
 * Lists reseller profiles. Used by admin filter dropdowns (supports ?ids=a,b,c).
 * Suppliers should only see resellers they already trade with.
 */
export async function GET(request: Request) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPPLIER') {
      return NextResponse.json(
        { error: 'Non autorisé - Réservé aux administrateurs et fournisseurs' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const idsParam = searchParams.get('ids')
    const search = searchParams.get('search') || ''

    const ids = idsParam
      ? idsParam
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined

    const where: any = {}

    if (ids && ids.length > 0) {
      where.id = { in: ids }
    }

    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ]
    }

    // A supplier may only see resellers that have already ordered from them
    if (session.user.role === 'SUPPLIER') {
      const supplierProfileId = session.user.supplierProfile?.id

      if (!supplierProfileId) {
        return NextResponse.json({ error: 'Profil fournisseur introuvable' }, { status: 403 })
      }

      const partnerOrders = await prisma.order.findMany({
        where: { supplierId: supplierProfileId },
        select: { resellerId: true },
        distinct: ['resellerId'],
      })

      const partnerIds = partnerOrders.map((order) => order.resellerId)
      where.id = where.id ? { in: where.id.filter((id: string) => partnerIds.includes(id)) } : { in: partnerIds }
    }

    const resellers = await prisma.resellerProfile.findMany({
      where,
      select: {
        id: true,
        userId: true,
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
      orderBy: { companyName: 'asc' },
    })

    return NextResponse.json({ resellers })
  } catch (error) {
    console.error('[Resellers GET] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des revendeurs' },
      { status: 500 }
    )
  }
}
