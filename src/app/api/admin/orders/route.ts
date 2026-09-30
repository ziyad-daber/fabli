export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { OrderStatus, UserRole } from '@prisma/client'
import { z } from 'zod'

// GET /api/admin/orders - List orders with filters (admin only)
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
    const supplierId = searchParams.get('supplierId') || undefined
    const resellerId = searchParams.get('resellerId') || undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined

    // Calculate skip for pagination
    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}

    // Search by order number, customer name, or supplier/reseller company name
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search, mode: 'insensitive' } },
        { supplier: { companyName: { contains: search, mode: 'insensitive' } } },
        { reseller: { companyName: { contains: search, mode: 'insensitive' } } }
      ]
    }

    // Filter by status
    if (status && Object.values(OrderStatus).includes(status as OrderStatus)) {
      where.status = status as OrderStatus
    }

    // Filter by supplier
    if (supplierId) {
      where.supplierId = supplierId
    }

    // Filter by reseller
    if (resellerId) {
      where.resellerId = resellerId
    }

    // Filter by date range (createdAt)
    if (startDate) {
      where.createdAt = {
        ...(where.createdAt || {}),
        gte: new Date(startDate)
      }
    }
    if (endDate) {
      where.createdAt = {
        ...(where.createdAt || {}),
        lte: new Date(endDate)
      }
    }

    // Get orders with pagination
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true
                }
              },
              variant: {
                select: {
                  id: true,
                  name: true,
                  value: true
                }
              }
            }
          },
          supplier: {
            select: {
              id: true,
              companyName: true
            }
          },
          reseller: {
            select: {
              id: true,
              companyName: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.order.count({ where })
    ])

    return NextResponse.json({
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('[Admin Orders GET] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des commandes' },
      { status: 500 }
    )
  }
}

// We don't need POST, PATCH, DELETE for orders in admin because order status updates are done via the supplier/reseller or specific endpoints.
// However, if we want to allow admin to manually change order status, we can add a PATCH endpoint.
// But for now, let's keep it read-only for admin orders management.
// If needed, we can add a PATCH endpoint similar to the supplier one but without role restrictions.