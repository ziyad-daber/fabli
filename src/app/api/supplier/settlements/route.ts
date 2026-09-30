export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { toCsv, csvResponse } from '@/lib/utils/csv'

/**
 * /api/supplier/settlements — règlements du fournisseur (§5.2 : « Consulter
 * … les commissions/règlements associés »). Lecture seule : seul
 * l'administrateur enregistre ou clôture un règlement.
 */
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'SUPPLIER') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const supplierId = session.user.supplierProfile?.id
    if (!supplierId) {
      return NextResponse.json({ error: 'Profil fournisseur introuvable' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)

    const [settlements, pending, aggregates] = await Promise.all([
      prisma.settlement.findMany({
        where: { supplierId },
        include: { transactions: { orderBy: { createdAt: 'desc' } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.commission.findMany({
        where: { order: { supplierId }, status: { in: ['PENDING', 'DUE'] } },
        select: { id: true, amount: true, currency: true, dueAt: true },
      }),
      prisma.commission.aggregate({
        where: { order: { supplierId } },
        _sum: { amount: true },
        _count: true,
      }),
    ])

    if (searchParams.get('format') === 'csv') {
      const csv = toCsv(
        [
          { key: 'reference', label: 'Référence' },
          { key: 'periodStart', label: 'Début période' },
          { key: 'periodEnd', label: 'Fin période' },
          { key: 'totalCommission', label: 'Total commissions' },
          { key: 'netAmount', label: 'Montant net' },
          { key: 'currency', label: 'Devise' },
          { key: 'status', label: 'Statut' },
          { key: 'paidAt', label: 'Réglé le' },
        ],
        settlements.map((settlement) => ({
          reference: settlement.reference ?? '',
          periodStart: settlement.periodStart.toISOString(),
          periodEnd: settlement.periodEnd.toISOString(),
          totalCommission: Number(settlement.totalCommission).toFixed(2),
          netAmount: Number(settlement.netAmount).toFixed(2),
          currency: settlement.currency,
          status: settlement.status,
          paidAt: settlement.paidAt?.toISOString() ?? '',
        }))
      )
      return csvResponse(csv, 'mes-reglements')
    }

    return NextResponse.json({
      settlements,
      pending: {
        count: pending.length,
        amount: pending.reduce((sum, commission) => sum + Number(commission.amount), 0),
        items: pending,
      },
      totals: {
        commissions: aggregate(aggregates._sum.amount),
        count: aggregates._count,
      },
    })
  } catch (error) {
    console.error('[Supplier settlements GET] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

function aggregate(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}