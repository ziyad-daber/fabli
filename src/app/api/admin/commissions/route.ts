export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { CommissionStatus } from '@prisma/client'
import { z } from 'zod'
import { audit, getRequestMeta } from '@/lib/utils/audit'
import { toCsv, csvResponse } from '@/lib/utils/csv'

/**
 * /api/admin/commissions — suivi des commissions (§5.7, §8).
 *
 * Chaque commande porte une commission calculée sur le prix de gros et
 * figée au moment de la commande (§5.6). Son statut évolue indépendamment :
 * due, réglée, en retard, contestée.
 *
 * `?format=csv` produit l'export CSV demandé au §8.
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
    const search = searchParams.get('search') || ''
    const supplierId = searchParams.get('supplierId') || ''
    const overdueOnly = searchParams.get('overdue') === 'true'

    const where: Record<string, unknown> = {}
    if (status && Object.values(CommissionStatus).includes(status as CommissionStatus)) {
      where.status = status
    }
    if (supplierId) where.order = { supplierId }
    if (search) {
      where.order = {
        ...(where.order as object),
        OR: [
          { orderNumber: { contains: search, mode: 'insensitive' } },
          { supplier: { companyName: { contains: search, mode: 'insensitive' } } },
          { reseller: { companyName: { contains: search, mode: 'insensitive' } } },
        ],
      }
    }
    if (overdueOnly) {
      where.status = { in: ['PENDING', 'DUE'] }
      where.dueAt = { lt: new Date() }
    }

    const [commissions, total, aggregates] = await Promise.all([
      prisma.commission.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              currency: true,
              grossMargin: true,
              netMargin: true,
              supplier: { select: { id: true, companyName: true } },
              reseller: { select: { id: true, companyName: true } },
            },
          },
          settlementItems: { select: { id: true, settlementId: true, type: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.commission.count({ where }),
      prisma.commission.groupBy({
        by: ['status'],
        _sum: { amount: true },
        _count: true,
      }),
    ])

    const totals = Object.fromEntries(
      aggregates.map((group) => [
        group.status,
        { count: group._count, amount: Number(group._sum.amount ?? 0) },
      ])
    )

    if (searchParams.get('format') === 'csv') {
      const csv = toCsv(
        [
          { key: 'orderNumber', label: 'Commande' },
          { key: 'supplier', label: 'Fournisseur' },
          { key: 'reseller', label: 'Revendeur' },
          { key: 'orderStatus', label: 'Statut commande' },
          { key: 'rate', label: 'Taux' },
          { key: 'amount', label: 'Commission' },
          { key: 'currency', label: 'Devise' },
          { key: 'status', label: 'Statut commission' },
          { key: 'calculatedAt', label: 'Calculée le' },
          { key: 'dueAt', label: 'Échéance' },
          { key: 'paidAt', label: 'Réglée le' },
        ],
        commissions.map((commission) => ({
          orderNumber: commission.order.orderNumber,
          supplier: commission.order.supplier.companyName,
          reseller: commission.order.reseller.companyName,
          orderStatus: commission.order.status,
          rate: `${Number(commission.rate) * 100}%`,
          amount: Number(commission.amount).toFixed(2),
          currency: commission.currency,
          status: commission.status,
          calculatedAt: commission.calculatedAt.toISOString(),
          dueAt: commission.dueAt?.toISOString() ?? '',
          paidAt: commission.paidAt?.toISOString() ?? '',
        }))
      )
      return csvResponse(csv, 'commissions')
    }

    return NextResponse.json({
      commissions,
      totals,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[Admin commissions GET] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

const updateSchema = z.object({
  status: z.enum(['PENDING', 'DUE', 'PAID', 'DISPUTED', 'REFUNDED']),
  notes: z.string().max(1000).optional(),
})

/** PATCH — mise à jour du statut d'une commission (contestation, règlement). */
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

    const id = body.id as string | undefined
    if (!id) {
      return NextResponse.json({ error: 'Identifiant de commission manquant' }, { status: 400 })
    }

    const existing = await prisma.commission.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Commission introuvable' }, { status: 404 })
    }

    const { status, notes } = validation.data
    const now = new Date()

    const commission = await prisma.commission.update({
      where: { id },
      data: {
        status,
        notes: notes ?? existing.notes,
        paidAt: status === 'PAID' ? (existing.paidAt ?? now) : existing.paidAt,
        settledAt: status === 'PAID' ? (existing.settledAt ?? now) : existing.settledAt,
      },
    })

    // Une commission réglée consigne une transaction, pour garder la trace du
    // mouvement même hors règlement groupé.
    if (status === 'PAID') {
      await prisma.settlementTransaction.create({
        data: {
          commissionId: id,
          type: 'COMMISSION_PAID',
          amount: commission.amount,
          currency: commission.currency,
          description: 'Commission réglée',
        },
      })
    }

    await audit({
      userId: session.user.id,
      action: 'COMMISSION_STATUS_UPDATED',
      entityType: 'Commission',
      entityId: id,
      oldData: { status: existing.status },
      newData: { status, amount: String(commission.amount) },
      ...getRequestMeta(request),
    })

    return NextResponse.json({ success: true, commission })
  } catch (error) {
    console.error('[Admin commissions PATCH] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}