export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { OrderStatus, ShipmentStatus } from '@prisma/client'

/**
 * /api/admin/stats — agrégats du tableau de bord administrateur (§8).
 * Remplace les valeurs codées en dur du tableau de bord.
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [
      totalUsers,
      pendingUsers,
      totalSuppliers,
      totalResellers,
      totalProducts,
      activeProducts,
      draftProducts,
      totalOrders,
      ordersByStatus,
      monthOrders,
      totalShipments,
      shipmentsByStatus,
      commissionTotals,
      codTotals,
      recentOrders,
      errorShipments,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'PENDING_VERIFICATION' } }),
      prisma.supplierProfile.count(),
      prisma.resellerProfile.count(),
      prisma.product.count(),
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.product.count({ where: { status: 'DRAFT' } }),
      prisma.order.count(),
      prisma.order.groupBy({ by: ['status'], _count: true }),
      prisma.order.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.shipment.count(),
      prisma.shipment.groupBy({ by: ['status'], _count: true }),
      prisma.commission.groupBy({ by: ['status'], _sum: { amount: true }, _count: true }),
      prisma.codCollection.groupBy({
        by: ['status'],
        _sum: { expectedAmount: true, collectedAmount: true },
        _count: true,
      }),
      prisma.order.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          codAmount: true,
          createdAt: true,
          customerName: true,
          supplier: { select: { companyName: true } },
        },
      }),
      prisma.shipment.findMany({
        where: { status: ShipmentStatus.ERROR },
        take: 5,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          trackingCode: true,
          status: true,
          errorMessage: true,
          updatedAt: true,
          order: { select: { orderNumber: true } },
        },
      }),
    ])

    const ordersByStatusMap = Object.fromEntries(
      ordersByStatus.map((row) => [row.status, row._count])
    ) as Record<OrderStatus, number>

    const shipmentsByStatusMap = Object.fromEntries(
      shipmentsByStatus.map((row) => [row.status, row._count])
    ) as Record<ShipmentStatus, number>

    const commissionByStatus = Object.fromEntries(
      commissionTotals.map((row) => [
        row.status,
        { count: row._count, amount: Number(row._sum.amount ?? 0) },
      ])
    )

    const codByStatus = Object.fromEntries(
      codTotals.map((row) => [
        row.status,
        {
          count: row._count,
          expected: Number(row._sum.expectedAmount ?? 0),
          collected: Number(row._sum.collectedAmount ?? 0),
        },
      ])
    )

    // Commandes actives sans mouvement depuis 30 jours : signal de commande bloquée.
    const stalledOrders = await prisma.order.count({
      where: {
        status: { in: ['ACCEPTED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPMENT_CREATED'] },
        updatedAt: { lt: thirtyDaysAgo },
      },
    })

    const revenue = await prisma.order.aggregate({
      where: { status: 'DELIVERED' },
      _sum: { codAmount: true },
    })

    return NextResponse.json({
      users: {
        total: totalUsers,
        pendingValidation: pendingUsers,
        suppliers: totalSuppliers,
        resellers: totalResellers,
      },
      products: { total: totalProducts, active: activeProducts, draft: draftProducts },
      orders: {
        total: totalOrders,
        thisMonth: monthOrders,
        delivered: ordersByStatusMap.DELIVERED ?? 0,
        pending: ordersByStatusMap.PENDING ?? 0,
        inProgress:
          (ordersByStatusMap.ACCEPTED ?? 0) +
          (ordersByStatusMap.IN_PRODUCTION ?? 0) +
          (ordersByStatusMap.READY_TO_SHIP ?? 0),
        byStatus: ordersByStatusMap,
        stalled: stalledOrders,
      },
      shipments: {
        total: totalShipments,
        inTransit: shipmentsByStatusMap.IN_TRANSIT ?? 0,
        delivered: shipmentsByStatusMap.DELIVERED ?? 0,
        errors: shipmentsByStatusMap.ERROR ?? 0,
        byStatus: shipmentsByStatusMap,
      },
      finance: {
        codDeliveredRevenue: Number(revenue._sum.codAmount ?? 0),
        commissions: commissionByStatus,
        cod: codByStatus,
      },
      recentOrders,
      alerts: buildAlerts({ pendingUsers, stalledOrders, errorShipments }),
    })
  } catch (error) {
    console.error('[Admin stats GET] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

interface AlertInput {
  pendingUsers: number
  stalledOrders: number
  errorShipments: Array<{
    id: string
    trackingCode: string | null
    errorMessage: string | null
    order: { orderNumber: string }
  }>
}

function buildAlerts(input: AlertInput) {
  const alerts: Array<{ level: 'info' | 'warning' | 'error'; message: string; href?: string }> = []

  if (input.pendingUsers > 0) {
    alerts.push({
      level: 'warning',
      message: `${input.pendingUsers} compte(s) en attente de validation`,
      href: '/dashboard/admin/users?status=PENDING_VERIFICATION',
    })
  }

  if (input.stalledOrders > 0) {
    alerts.push({
      level: 'warning',
      message: `${input.stalledOrders} commande(s) sans mouvement depuis 30 jours`,
      href: '/dashboard/admin/orders',
    })
  }

  for (const shipment of input.errorShipments) {
    if (shipment.errorMessage) {
      alerts.push({
        level: 'error',
        message: `Expédition ${shipment.trackingCode ?? shipment.order.orderNumber} : ${shipment.errorMessage}`,
        href: '/dashboard/admin/shipments',
      })
    }
  }

  return alerts
}