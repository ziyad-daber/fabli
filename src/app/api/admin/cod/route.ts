export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { round2 } from '@/lib/utils/commission'
import { audit, getRequestMeta } from '@/lib/utils/audit'
import { toCsv, csvResponse } from '@/lib/utils/csv'

/**
 * /api/admin/cod — rapprochement COD (§5.7).
 *
 * AMEEX n'expose pas d'endpoint de reversement COD dans la documentation
 * fournie : le montant réellement encaissé est saisi par l'administrateur à
 * partir du rapport du transporteur, et l'écart éventuel est consigné.
 *
 * Tant que le bénéficiaire COD, les modalités de reversement et les données
 * exposées par l'API ne sont pas confirmés (§16), cette saisie manuelle est le
 * seul chemin fiable — ce qui est exactement ce que prévoit le cahier des
 * charges.
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

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (search) {
      where.order = {
        OR: [
          { orderNumber: { contains: search, mode: 'insensitive' } },
          { customerName: { contains: search, mode: 'insensitive' } },
        ],
      }
    }

    const [collections, total, aggregates] = await Promise.all([
      prisma.codCollection.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              customerName: true,
              customerCity: true,
              currency: true,
              supplier: { select: { id: true, companyName: true } },
              shipments: { select: { id: true, trackingCode: true, carrier: true, deliveredAt: true } },
            },
          },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.codCollection.count({ where }),
      prisma.codCollection.groupBy({
        by: ['status'],
        _sum: { expectedAmount: true, collectedAmount: true, settledAmount: true },
        _count: true,
      }),
    ])

    const totals = Object.fromEntries(
      aggregates.map((group) => [
        group.status,
        {
          count: group._count,
          expected: Number(group._sum.expectedAmount ?? 0),
          collected: Number(group._sum.collectedAmount ?? 0),
          settled: Number(group._sum.settledAmount ?? 0),
        },
      ])
    )

    if (searchParams.get('format') === 'csv') {
      const csv = toCsv(
        [
          { key: 'orderNumber', label: 'Commande' },
          { key: 'supplierName', label: 'Fournisseur' },
          { key: 'customerName', label: 'Client' },
          { key: 'city', label: 'Ville' },
          { key: 'trackingCode', label: 'Code Suivi' },
          { key: 'deliveredAt', label: 'Livré le' },
          { key: 'expected', label: 'Attendu' },
          { key: 'collected', label: 'Encaissé' },
          { key: 'settled', label: 'Reversé' },
          { key: 'gap', label: 'Écart' },
          { key: 'currency', label: 'Devise' },
          { key: 'status', label: 'Statut' },
          { key: 'carrierReference', label: 'Référence transporteur' },
          { key: 'notes', label: 'Notes' },
        ],
        collections.map((collection) => ({
          orderNumber: collection.order.orderNumber,
          supplierName: collection.order.supplier.companyName,
          customerName: collection.order.customerName,
          city: collection.order.customerCity,
          trackingCode: collection.order.shipments[0]?.trackingCode ?? '',
          deliveredAt: collection.order.shipments[0]?.deliveredAt?.toISOString() ?? '',
          expected: Number(collection.expectedAmount).toFixed(2),
          collected: Number(collection.collectedAmount).toFixed(2),
          settled: Number(collection.settledAmount).toFixed(2),
          gap: round2(Number(collection.expectedAmount) - Number(collection.collectedAmount)).toFixed(2),
          currency: collection.currency,
          status: collection.status,
          carrierReference: collection.carrierReference ?? '',
          notes: collection.notes ?? '',
        }))
      )
      return csvResponse(csv, 'cod')
    }

    return NextResponse.json({
      collections,
      totals,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[Admin COD GET] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

const reconcileSchema = z.object({
  id: z.string().min(1, 'Identifiant manquant'),
  collectedAmount: z.number().min(0, 'Le montant encaissé ne peut pas être négatif').optional(),
  settledAmount: z.number().min(0).optional(),
  carrierReference: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  /** Forcer un statut, sinon il est déduit de l'écart constaté. */
  status: z.enum(['EXPECTED', 'COLLECTED', 'SETTLED', 'DISCREPANCY', 'REFUNDED']).optional(),
})

/**
 * PATCH — consigne le montant réellement encaissé, le reversement et l'écart.
 */
export async function PATCH(request: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const body = await request.json()
    const validation = reconcileSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { id, collectedAmount, settledAmount, carrierReference, notes, status } = validation.data

    const existing = await prisma.codCollection.findUnique({
      where: { id },
      include: { order: { select: { orderNumber: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Collecte COD introuvable' }, { status: 404 })
    }

    const collected = collectedAmount ?? Number(existing.collectedAmount)
    const settled = settledAmount ?? Number(existing.settledAmount)
    const expected = Number(existing.expectedAmount)

    // Statut déduit de l'écart : un montant encaissé différent de l'attendu
    // reste un écart à traiter, pas un succès.
    let nextStatus = status
    if (!nextStatus) {
      if (collected === 0) nextStatus = 'EXPECTED'
      else if (round2(collected - expected) !== 0) nextStatus = 'DISCREPANCY'
      else if (settled > 0 && round2(settled - collected) === 0) nextStatus = 'SETTLED'
      else nextStatus = 'COLLECTED'
    }

    const collection = await prisma.codCollection.update({
      where: { id },
      data: {
        collectedAmount: collected,
        settledAmount: settled,
        carrierReference: carrierReference ?? existing.carrierReference,
        notes: notes ?? existing.notes,
        status: nextStatus,
        collectedAt: collected > 0 ? (existing.collectedAt ?? new Date()) : existing.collectedAt,
        settledAt: settled > 0 ? (existing.settledAt ?? new Date()) : existing.settledAt,
      },
    })

    if (nextStatus === 'DISCREPANCY') {
      await prisma.settlementTransaction.create({
        data: {
          type: 'COD_DISCREPANCY',
          amount: round2(collected - expected),
          currency: collection.currency,
          description: `Écart COD sur la commande ${existing.order.orderNumber} (attendu ${expected}, encaissé ${collected})`,
          reference: carrierReference,
        },
      })
    }

    await audit({
      userId: session.user.id,
      action: 'COD_RECONCILED',
      entityType: 'CodCollection',
      entityId: id,
      oldData: {
        collected: String(existing.collectedAmount),
        status: existing.status,
      },
      newData: { collected: String(collected), settled: String(settled), status: nextStatus },
      ...getRequestMeta(request),
    })

    return NextResponse.json({
      success: true,
      collection,
      gap: round2(collected - expected),
    })
  } catch (error) {
    console.error('[Admin COD PATCH] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}