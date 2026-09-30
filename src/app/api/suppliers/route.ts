export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'

/**
 * GET /api/suppliers
 * Lists supplier profiles. Used by admin filter dropdowns (supports ?ids=a,b,c)
 * and by the supplier/reseller order flows.
 */
export async function GET(request: Request) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const idsParam = searchParams.get('ids')
    const search = searchParams.get('search') || ''
    const isVerified = searchParams.get('isVerified')

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

    if (isVerified !== null && isVerified !== undefined) {
      where.isVerified = isVerified === 'true'
    }

    // Resellers must not be able to enumerate suppliers beyond what ordering needs
    if (session.user.role === 'RESELLER' && !ids) {
      where.isVerified = true
    }

    const suppliers = await prisma.supplierProfile.findMany({
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

    return NextResponse.json({ suppliers })
  } catch (error) {
    console.error('[Suppliers GET] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des fournisseurs' },
      { status: 500 }
    )
  }
}
