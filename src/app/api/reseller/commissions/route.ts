export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { toCsv, csvResponse } from '@/lib/utils/csv'

/**
 * /api/reseller/commissions — marges et commissions du revendeur (§5.3,
 * §5.6). Lecture seule : le revendeur voit ce qu'il gagne, l'administrateur
 * reste seul à pouvoir Settler.
 */
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'RESELLER') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const resellerId = session.user.resellerProfile?.id
    if (!resellerId) {
      return NextResponse.json({ error: 'Profil revendeur introuvable' }, { status: 404 })
    }

    const orders = await prisma.order.findMany({
      where: { resellerId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        currency: true,
        subtotal: true,
        shippingFee: true,
        codAmount: true,
        commissionAmount: true,
        commissionRate: true,
        grossMargin: true,
        netMargin: true,
        createdAt: true,
        deliveredAt: true,
        supplier: { select: { companyName: true } },
        commission: { select: { status: true, dueAt: true, paidAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    const sums = orders.reduce(
      (acc, order) => {
        acc.revenue += Number(order.subtotal)
        acc.shipping += Number(order.shippingFee)
        acc.commission += Number(order.commissionAmount)
        acc.grossMargin += Number(order.grossMargin)
        acc.netMargin += Number(order.netMargin)
        acc.codExpected += Number(order.codAmount)
        if (order.status === 'DELIVERED') {
          acc.deliveredRevenue += Number(order.subtotal)
          acc.deliveredNetMargin += Number(order.netMargin)
        }
        return acc
      },
      { revenue: 0, shipping: 0, commission: 0, grossMargin: 0, netMargin: 0, codExpected: 0, deliveredRevenue: 0, deliveredNetMargin: 0 }
    )

    const { searchParams } = new URL(request.url)
    if (searchParams.get('format') === 'csv') {
      const csv = toCsv(
        [
          { key: 'orderNumber', label: 'Commande' },
          { key: 'supplier', label: 'Fournisseur' },
          { key: 'status', label: 'Statut' },
          { key: 'createdAt', label: 'Date' },
          { key: 'revenue', label: 'CA articles' },
          { key: 'shipping', label: 'Livraison' },
          { key: 'cod', label: 'COD' },
          { key: 'commission', label: 'Commission plateforme' },
          { key: 'grossMargin', label: 'Marge brute' },
          { key: 'netMargin', label: 'Marge nette' },
          { key: 'currency', label: 'Devise' },
        ],
        orders.map((order) => ({
          orderNumber: order.orderNumber,
          supplier: order.supplier.companyName,
          status: order.status,
          createdAt: order.createdAt.toISOString(),
          revenue: Number(order.subtotal).toFixed(2),
          shipping: Number(order.shippingFee).toFixed(2),
          cod: Number(order.codAmount).toFixed(2),
          commission: Number(order.commissionAmount).toFixed(2),
          grossMargin: Number(order.grossMargin).toFixed(2),
          netMargin: Number(order.netMargin).toFixed(2),
          currency: order.currency,
        }))
      )
      return csvResponse(csv, 'mes-marges')
    }

    return NextResponse.json({
      orders,
      summary: sums,
      counts: {
        total: orders.length,
        delivered: orders.filter((order) => order.status === 'DELIVERED').length,
        inProgress: orders.filter((order) =>
          ['ACCEPTED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPMENT_CREATED', 'IN_TRANSIT'].includes(
            order.status
          )
        ).length,
      },
    })
  } catch (error) {
    console.error('[Reseller commissions GET] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}