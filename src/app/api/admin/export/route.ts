export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { toCsv, csvResponse } from '@/lib/utils/csv'

/**
 * /api/admin/export — export CSV (§8).
 *
 * Un point d'entrée unique pour les quatre jeux de données principaux :
 * orders, shipments, commissions, settlements (via `?dataset=...`).
 * Les données sont filtrées exactement comme les écrans correspondants :
 * l'export ne doit jamais révéler plus que l'écran.
 */

const DATASETS = ['orders', 'shipments', 'commissions', 'settlements'] as const
type Dataset = (typeof DATASETS)[number]

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const requested = searchParams.get('dataset') as Dataset | null
    const dataset: Dataset = requested && DATASETS.includes(requested) ? requested : 'orders'

    const { csv, filename } = await buildDataset(dataset)

    return csvResponse(csv, filename)
  } catch (error) {
    console.error('[Admin export GET] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

async function buildDataset(dataset: Dataset): Promise<{ csv: string; filename: string }> {
  if (dataset === 'orders') {
    const orders = await prisma.order.findMany({
      include: {
        supplier: { select: { companyName: true } },
        reseller: { select: { companyName: true } },
        items: true,
        shipments: { select: { trackingCode: true, carrier: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    })

    return {
      filename: 'commandes',
      csv: toCsv(
        [
          { key: 'orderNumber', label: 'Numéro' },
          { key: 'createdAt', label: 'Date' },
          { key: 'status', label: 'Statut' },
          { key: 'supplier', label: 'Fournisseur' },
          { key: 'reseller', label: 'Revendeur' },
          { key: 'customerName', label: 'Client' },
          { key: 'customerPhone', label: 'Téléphone' },
          { key: 'customerCity', label: 'Ville' },
          { key: 'itemsCount', label: 'Nb articles' },
          { key: 'subtotal', label: 'Sous-total' },
          { key: 'shippingFee', label: 'Livraison' },
          { key: 'codAmount', label: 'COD' },
          { key: 'commissionAmount', label: 'Commission' },
          { key: 'grossMargin', label: 'Marge brute' },
          { key: 'netMargin', label: 'Marge nette' },
          { key: 'currency', label: 'Devise' },
          { key: 'trackingCode', label: 'Code Suivi' },
          { key: 'deliveredAt', label: 'Livré le' },
        ],
        orders.map((order) => ({
          orderNumber: order.orderNumber,
          createdAt: order.createdAt.toISOString(),
          status: order.status,
          supplier: order.supplier.companyName,
          reseller: order.reseller.companyName,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerCity: order.customerCity,
          itemsCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
          subtotal: Number(order.subtotal).toFixed(2),
          shippingFee: Number(order.shippingFee).toFixed(2),
          codAmount: Number(order.codAmount).toFixed(2),
          commissionAmount: Number(order.commissionAmount).toFixed(2),
          grossMargin: Number(order.grossMargin).toFixed(2),
          netMargin: Number(order.netMargin).toFixed(2),
          currency: order.currency,
          trackingCode: order.shipments[0]?.trackingCode ?? '',
          deliveredAt: order.deliveredAt?.toISOString() ?? '',
        }))
      ),
    }
  }

  if (dataset === 'shipments') {
    const shipments = await prisma.shipment.findMany({
      include: {
        order: {
          select: {
            orderNumber: true,
            status: true,
            customerName: true,
            supplier: { select: { companyName: true } },
            reseller: { select: { companyName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    })

    return {
      filename: 'expeditions',
      csv: toCsv(
        [
          { key: 'trackingCode', label: 'Code Suivi' },
          { key: 'carrier', label: 'Transporteur' },
          { key: 'status', label: 'Statut' },
          { key: 'orderNumber', label: 'Commande' },
          { key: 'supplier', label: 'Fournisseur' },
          { key: 'reseller', label: 'Revendeur' },
          { key: 'customerName', label: 'Client' },
          { key: 'weight', label: 'Poids (kg)' },
          { key: 'codAmount', label: 'COD' },
          { key: 'currency', label: 'Devise' },
          { key: 'isManual', label: 'Saisie manuelle' },
          { key: 'createdAt', label: 'Créée le' },
          { key: 'pickedUpAt', label: 'Collectée le' },
          { key: 'deliveredAt', label: 'Livrée le' },
          { key: 'lastTrackingAt', label: 'Dernier suivi' },
        ],
        shipments.map((shipment) => ({
          trackingCode: shipment.trackingCode ?? '',
          carrier: shipment.carrier,
          status: shipment.status,
          orderNumber: shipment.order.orderNumber,
          supplier: shipment.order.supplier.companyName,
          reseller: shipment.order.reseller.companyName,
          customerName: shipment.order.customerName,
          weight: shipment.weight ? Number(shipment.weight).toFixed(3) : '',
          codAmount: shipment.codAmount ? Number(shipment.codAmount).toFixed(2) : '',
          currency: 'MAD',
          isManual: shipment.isManual ? 'oui' : 'non',
          createdAt: shipment.createdAt.toISOString(),
          pickedUpAt: shipment.pickedUpAt?.toISOString() ?? '',
          deliveredAt: shipment.deliveredAt?.toISOString() ?? '',
          lastTrackingAt: shipment.lastTrackingAt?.toISOString() ?? '',
        }))
      ),
    }
  }

  if (dataset === 'commissions') {
    const commissions = await prisma.commission.findMany({
      include: {
        order: {
          select: {
            orderNumber: true,
            supplier: { select: { companyName: true } },
            reseller: { select: { companyName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    })

    return {
      filename: 'commissions',
      csv: toCsv(
        [
          { key: 'orderNumber', label: 'Commande' },
          { key: 'supplier', label: 'Fournisseur' },
          { key: 'reseller', label: 'Revendeur' },
          { key: 'rate', label: 'Taux' },
          { key: 'amount', label: 'Montant' },
          { key: 'currency', label: 'Devise' },
          { key: 'status', label: 'Statut' },
          { key: 'dueAt', label: 'Échéance' },
          { key: 'paidAt', label: 'Réglé le' },
        ],
        commissions.map((commission) => ({
          orderNumber: commission.order.orderNumber,
          supplier: commission.order.supplier.companyName,
          reseller: commission.order.reseller.companyName,
          rate: `${Number(commission.rate) * 100}%`,
          amount: Number(commission.amount).toFixed(2),
          currency: commission.currency,
          status: commission.status,
          dueAt: commission.dueAt?.toISOString() ?? '',
          paidAt: commission.paidAt?.toISOString() ?? '',
        }))
      ),
    }
  }

  const settlements = await prisma.settlement.findMany({
    include: { supplier: { select: { companyName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10000,
  })

  return {
    filename: 'reglements',
    csv: toCsv(
      [
        { key: 'reference', label: 'Référence' },
        { key: 'supplier', label: 'Fournisseur' },
        { key: 'periodStart', label: 'Début période' },
        { key: 'periodEnd', label: 'Fin période' },
        { key: 'totalCommission', label: 'Total commissions' },
        { key: 'netAmount', label: 'Net' },
        { key: 'currency', label: 'Devise' },
        { key: 'status', label: 'Statut' },
        { key: 'paidAt', label: 'Réglé le' },
      ],
      settlements.map((settlement) => ({
        reference: settlement.reference ?? '',
        supplier: settlement.supplier.companyName,
        periodStart: settlement.periodStart.toISOString(),
        periodEnd: settlement.periodEnd.toISOString(),
        totalCommission: Number(settlement.totalCommission).toFixed(2),
        netAmount: Number(settlement.netAmount).toFixed(2),
        currency: settlement.currency,
        status: settlement.status,
        paidAt: settlement.paidAt?.toISOString() ?? '',
      }))
    ),
  }
}