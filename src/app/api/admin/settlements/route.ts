export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { SettlementStatus } from '@prisma/client'
import { z } from 'zod'
import { round2 } from '@/lib/utils/commission'
import { audit, getRequestMeta } from '@/lib/utils/audit'
import { toCsv, csvResponse } from '@/lib/utils/csv'
import { notifySettlementPaid } from '@/lib/notifications/service'

/**
 * /api/admin/settlements — règlements fournisseurs (§5.7, §8).
 *
 * Un règlement regroupe les commissions d'une période pour un fournisseur.
 * Les montants sont figés à la création : le règlement est un document, pas
 * une requête recalculée en continu.
 */

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
    const status = searchParams.get('status') || ''
    const supplierId = searchParams.get('supplierId') || ''

    const where: Record<string, unknown> = {}
    if (status && Object.values(SettlementStatus).includes(status as SettlementStatus)) {
      where.status = status
    }
    if (supplierId) where.supplierId = supplierId

    const [settlements, total] = await Promise.all([
      prisma.settlement.findMany({
        where,
        include: {
          supplier: { select: { id: true, companyName: true, userId: true } },
          transactions: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.settlement.count({ where }),
    ])

    if (searchParams.get('format') === 'csv') {
      const csv = toCsv(
        [
          { key: 'reference', label: 'Référence' },
          { key: 'supplierName', label: 'Fournisseur' },
          { key: 'periodStart', label: 'Début période' },
          { key: 'periodEnd', label: 'Fin période' },
          { key: 'totalCommission', label: 'Total commissions' },
          { key: 'netAmount', label: 'Montant net' },
          { key: 'currency', label: 'Devise' },
          { key: 'status', label: 'Statut' },
          { key: 'paidAt', label: 'Réglé le' },
          { key: 'notes', label: 'Notes' },
        ],
        settlements.map((settlement) => ({
          reference: settlement.reference ?? '',
          supplierName: settlement.supplier.companyName,
          periodStart: settlement.periodStart.toISOString(),
          periodEnd: settlement.periodEnd.toISOString(),
          totalCommission: Number(settlement.totalCommission).toFixed(2),
          netAmount: Number(settlement.netAmount).toFixed(2),
          currency: settlement.currency,
          status: settlement.status,
          paidAt: settlement.paidAt?.toISOString() ?? '',
          notes: settlement.notes ?? '',
        }))
      )
      return csvResponse(csv, 'reglements')
    }

    return NextResponse.json({
      settlements,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[Admin settlements GET] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

const createSchema = z.object({
  supplierId: z.string().min(1, 'Fournisseur requis'),
  periodStart: z.string().datetime({ offset: true }).or(z.string().min(10)),
  periodEnd: z.string().datetime({ offset: true }).or(z.string().min(10)),
  reference: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
})

/**
 * POST — crée un règlement à partir des commissions livrées non encore
 * réglées sur la période. Regroupe automatiquement les lignes et fige les
 * montants.
 */
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const body = await request.json()
    const validation = createSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const data = validation.data
    const supplier = await prisma.supplierProfile.findUnique({
      where: { id: data.supplierId },
      select: { id: true, companyName: true },
    })
    if (!supplier) {
      return NextResponse.json({ error: 'Fournisseur introuvable' }, { status: 400 })
    }

    const periodStart = new Date(data.periodStart)
    const periodEnd = new Date(data.periodEnd)
    if (periodEnd < periodStart) {
      return NextResponse.json(
        { error: 'La fin de période doit être postérieure au début' },
        { status: 400 }
      )
    }

    // Seules les commandes effectivement livrées enters dans un règlement : une
    // commande refusée ou annulée ne doit rien générer.
    const eligible = await prisma.commission.findMany({
      where: {
        order: {
          supplierId: supplier.id,
          status: 'DELIVERED',
          deliveredAt: { gte: periodStart, lte: periodEnd },
        },
        status: { in: ['PENDING', 'DUE'] },
        settlementItems: { none: {} },
      },
      include: { order: { select: { id: true, orderNumber: true, codAmount: true, currency: true } } },
    })

    if (eligible.length === 0) {
      return NextResponse.json(
        { error: 'Aucune commission éligible sur cette période pour ce fournisseur' },
        { status: 400 }
      )
    }

    const totalCommission = round2(
      eligible.reduce((sum, commission) => sum + Number(commission.amount), 0)
    )
    const totalCod = round2(
      eligible.reduce((sum, commission) => sum + Number(commission.order.codAmount), 0)
    )
    const reference = data.reference || `REG-${periodStart.getFullYear()}-${Date.now().toString(36).toUpperCase()}`

    const settlement = await prisma.$transaction(async (tx) => {
      const created = await tx.settlement.create({
        data: {
          supplierId: supplier.id,
          periodStart,
          periodEnd,
          totalCommission,
          totalCod,
          netAmount: totalCommission,
          currency: eligible[0].order.currency || 'MAD',
          status: 'PROCESSING',
          reference,
          notes: data.notes,
          transactions: {
            create: eligible.map((commission) => ({
              commissionId: commission.id,
              type: 'COMMISSION_INCLUDED',
              amount: commission.amount,
              currency: commission.currency,
              description: `Commande ${commission.order.orderNumber}`,
              reference,
            })),
          },
        },
        include: { transactions: true, supplier: { select: { companyName: true } } },
      })

      // Les commissions passent en « due » jusqu'au règlement effectif.
      await tx.commission.updateMany({
        where: { id: { in: eligible.map((commission) => commission.id) } },
        data: { status: 'DUE' },
      })

      return created
    })

    await audit({
      userId: session.user.id,
      action: 'SETTLEMENT_CREATED',
      entityType: 'Settlement',
      entityId: settlement.id,
      newData: { supplier: supplier.companyName, reference, totalCommission },
      ...getRequestMeta(request),
    })

    return NextResponse.json({ success: true, settlement }, { status: 201 })
  } catch (error) {
    console.error('[Admin settlements POST] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DISPUTED']),
  reference: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
})

/** PATCH — suivi du règlement jusqu'au statut « payé ». */
export async function PATCH(request: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const body = await request.json()
    const validation = updateSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { id, status, reference, notes } = validation.data

    const existing = await prisma.settlement.findUnique({
      where: { id },
      include: {
        transactions: { select: { commissionId: true, amount: true, currency: true } },
        supplier: { select: { userId: true, companyName: true } },
      },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Règlement introuvable' }, { status: 404 })
    }

    const now = new Date()

    const settlement = await prisma.$transaction(async (tx) => {
      const updated = await tx.settlement.update({
        where: { id },
        data: {
          status,
          reference: reference ?? existing.reference,
          notes: notes ?? existing.notes,
          paidAt: status === 'COMPLETED' ? (existing.paidAt ?? now) : existing.paidAt,
        },
        include: { transactions: true, supplier: { select: { companyName: true, userId: true } } },
      })

      if (status === 'COMPLETED') {
        const commissionIds = existing.transactions
          .map((transaction) => transaction.commissionId)
          .filter((value): value is string => Boolean(value))

        if (commissionIds.length > 0) {
          await tx.commission.updateMany({
            where: { id: { in: commissionIds } },
            data: { status: 'PAID', paidAt: now, settledAt: now },
          })
        }

        await tx.settlementTransaction.create({
          data: {
            settlementId: id,
            type: 'SETTLEMENT_PAID',
            amount: updated.netAmount,
            currency: updated.currency,
            description: `Règlement ${updated.reference ?? id} marqué payé`,
            reference: updated.reference,
          },
        })
      }

      return updated
    })

    if (status === 'COMPLETED') {
      const supplierUser = await prisma.user.findUnique({
        where: { id: settlement.supplier.userId },
        select: { email: true },
      })
      if (supplierUser) {
        void notifySettlementPaid(
          supplierUser.email,
          settlement.supplier.userId,
          Number(settlement.netAmount),
          settlement.reference ?? settlement.id
        )
      }
    }

    await audit({
      userId: session.user.id,
      action: 'SETTLEMENT_STATUS_UPDATED',
      entityType: 'Settlement',
      entityId: id,
      oldData: { status: existing.status },
      newData: { status, amount: String(settlement.netAmount) },
      ...getRequestMeta(request),
    })

    return NextResponse.json({ success: true, settlement })
  } catch (error) {
    console.error('[Admin settlements PATCH] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}