import { Prisma, ShipmentStatus } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { AmexAdapter } from '@/lib/ameex/adapter'
import { resolveCityOrThrow, UnknownCityError } from '@/lib/ameex/cities'
import { applyOrderTransition, OrderTransitionError } from '@/lib/orders/transition'
import { notifyTrackingCodeAvailable } from '@/lib/notifications/service'
import { generateIdempotencyKey } from '@/lib/utils/helpers'
import { audit, getRequestMeta } from '@/lib/utils/audit'

/**
 * Création d'expédition via le compte AMEEX central (§6.2).
 *
 * Séquence :
 *  1. le fournisseur confirme que le colis est prêt ;
 *  2. le backend transmet à AMEEX les données de l'expédition ;
 *  3. en cas de succès, le Code Suivi est enregistré et l'ordre passe en
 *     « Expédition créée » ;
 *  4. le Code Suivi est communiqué aux parties autorisées.
 *
 * L'idempotence est assurée côté serveur par `Shipment.idempotencyKey`, qui
 * est transmis comme `exchange_code` : un double clic ou un réessai après
 * timeout ne crée pas de doublon chez AMEEX.
 */

export class ShipmentCreationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 400,
    readonly shipmentId?: string
  ) {
    super(message)
    this.name = 'ShipmentCreationError'
  }
}

interface CreateShipmentParams {
  orderId: string
  actorId: string
  actorRole: 'ADMIN' | 'SUPPLIER'
  request?: Request
  /** Dimensions forcées par l'administrateur si le produit ne les porte pas. */
  packageOverride?: { weight?: number; length?: number; width?: number; height?: number }
}

/** Un colis par défaut à 1 kg : évite de bloquer une expédition faute de poids. */
const DEFAULT_WEIGHT_KG = 1

export async function createShipmentForOrder(params: CreateShipmentParams) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: {
      items: { include: { product: true } },
      supplier: { include: { pickupAddresses: true } },
      pickupAddress: { include: { ameexCity: true } },
      shipments: true,
    },
  })

  if (!order) throw new ShipmentCreationError('Commande introuvable', 404)

  if (order.status !== 'READY_TO_SHIP') {
    throw new ShipmentCreationError(
      `La commande doit être « Prête à expédier » avant de créer une expédition (statut actuel : ${order.status}).`,
      400
    )
  }

  // Un autre colis est-il déjà en cours ? Une commande peut avoir plusieurs
  // expéditions (§5.5) mais une seule à la fois.
  const openShipment = order.shipments.find((s) =>
    ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(s.status)
  )
  if (openShipment && !openShipment.errorMessage) {
    throw new ShipmentCreationError(
      `Une expédition est déjà ouverte pour cette commande (Code Suivi ${openShipment.trackingCode ?? 'en attente'}).`,
      409,
      openShipment.id
    )
  }

  const pickup = order.pickupAddress ?? order.supplier.pickupAddresses.find((a) => a.isDefault)
  if (!pickup) {
    throw new ShipmentCreationError(
      "Aucune adresse de ramassage n'est enregistrée pour ce fournisseur.",
      400
    )
  }

  // §6.3 : les deux villes (ramassage et livraison) doivent être rattachées à
  // un identifiant AMEEX.
  let pickupCityId: string
  let deliveryCityId: string
  try {
    const [pickupCity, deliveryCity] = await Promise.all([
      pickup.cityId
        ? prisma.city.findUnique({ where: { id: pickup.cityId } })
        : resolveCityOrThrow(pickup.city),
      order.deliveryCityId
        ? prisma.city.findUnique({ where: { id: order.deliveryCityId } })
        : resolveCityOrThrow(order.customerCity),
    ])

    if (!pickupCity) {
      throw new ShipmentCreationError(
        `L'adresse de ramassage « ${pickup.city} » n'est rattachée à aucune ville AMEEX.`,
        400
      )
    }
    if (!deliveryCity) {
      throw new ShipmentCreationError(
        `La ville de livraison « ${order.customerCity} » n'est rattachée à aucune ville AMEEX.`,
        400
      )
    }
    pickupCityId = pickupCity.ameexId
    deliveryCityId = deliveryCity.ameexId
  } catch (error) {
    if (error instanceof UnknownCityError) throw new ShipmentCreationError(error.message, 400)
    throw error
  }

  // Poids : somme des produits, sauf surcharge explicite de l'appelant. Sans
  // donnée exploitable, on part sur 1 kg plutôt que de bloquer l'expédition.
  const summedWeight = order.items.reduce((sum, item) => sum + Number(item.product.weight ?? 0), 0)
  const weight = params.packageOverride?.weight ?? (summedWeight > 0 ? summedWeight : DEFAULT_WEIGHT_KG)

  const idempotencyKey = generateIdempotencyKey(`ord_${order.id}`)

  // §6.4 : un Code Suivi ne peut pas être rattaché à une autre commande. La
  // vérification se fait sur la valeur renvoyée par AMEEX, avant écriture.
  const existingWithKey = await prisma.shipment.findUnique({
    where: { idempotencyKey },
    include: { order: { select: { orderNumber: true } } },
  })
  if (existingWithKey) {
    return { shipment: existingWithKey, reused: true, orderNumber: existingWithKey.order.orderNumber }
  }

  const adapter = await AmexAdapter.create().catch(() => null)
  if (!adapter) {
    throw new ShipmentCreationError(
      "L'intégration AMEEX n'est pas configurée. Un administrateur peut saisir le transporteur et le Code Suivi manuellement.",
      503
    )
  }

  const result = await adapter.createShipment({
    orderReference: order.orderNumber,
    idempotencyKey,
    recipient: {
      name: order.customerName,
      phone: order.customerPhone,
      cityId: deliveryCityId,
      cityLabel: order.customerCity,
      address: order.customerAddress,
      postalCode: order.customerPostalCode ?? undefined,
    },
    pickup: {
      name: pickup.name,
      contactName: pickup.contactName,
      phone: pickup.phone,
      cityId: pickupCityId,
      cityLabel: pickup.city,
      address: pickup.address,
      postalCode: pickup.postalCode ?? undefined,
    },
    pieces: 1,
    weight,
    length: params.packageOverride?.length,
    width: params.packageOverride?.width,
    height: params.packageOverride?.height,
    codAmount: Number(order.codAmount),
    comment: order.customerNotes ?? undefined,
    productItems: order.items.map((item) => ({ id: item.productId, qty: item.quantity })),
  })

  if (!result.success || !result.trackingCode) {
    // Échec tracé : aucun colis local n'est créé, la commande reste
    // « Prête à expédier » et l'utilisateur peut corriger puis réessayer.
    throw new ShipmentCreationError(
      `Création d'expédition refusée par AMEEX : ${result.error ?? 'raison inconnue'}`,
      502
    )
  }

  // Garde-fou §6.4 : ce Code Suivi n'est déjà rattaché à aucune autre commande.
  const duplicate = await prisma.shipment.findUnique({
    where: { trackingCode: result.trackingCode },
    include: { order: { select: { id: true, orderNumber: true } } },
  })
  if (duplicate && duplicate.orderId !== order.id) {
    throw new ShipmentCreationError(
      `Le Code Suivi ${result.trackingCode} est déjà rattaché à la commande ${duplicate.order.orderNumber}. Aucune modification n'a été effectuée.`,
      409
    )
  }

  const shipment = await prisma.$transaction(async (tx) => {
    const created = await tx.shipment.create({
      data: {
        orderId: order.id,
        externalId: result.shipmentId ?? null,
        trackingCode: result.trackingCode,
        labelUrl: result.labelUrl ?? null,
        status: ShipmentStatus.CREATED,
        carrier: 'AMEEX',
        pieces: 1,
        weight,
        length: params.packageOverride?.length ?? null,
        width: params.packageOverride?.width ?? null,
        height: params.packageOverride?.height ?? null,
        codAmount: order.codAmount,
        idempotencyKey,
        isManual: false,
        createdById: params.actorId,
        pickupAddress: {
          name: pickup.name,
          contactName: pickup.contactName,
          phone: pickup.phone,
          address: pickup.address,
          city: pickup.city,
          postalCode: pickup.postalCode,
        },
        deliveryAddress: {
          name: order.customerName,
          phone: order.customerPhone,
          address: order.customerAddress,
          city: order.customerCity,
          postalCode: order.customerPostalCode,
        },
      },
    })

    // §5.7 : rattacher la collecte COD à ce colis précis (et non au premier
    // colis trouvé sur la commande).
    await tx.codCollection.updateMany({
      where: { orderId: order.id },
      data: { shipmentId: created.id },
    })

    await applyOrderTransition({
      orderId: order.id,
      to: 'SHIPMENT_CREATED',
      actorId: params.actorId,
      actorRole: params.actorRole,
      notes: `Expédition créée via AMEEX (Code Suivi ${result.trackingCode})`,
      tx,
    })

    return created
  })

  await notifyTrackingCodeAvailable(order.id, result.trackingCode, 'AMEEX')

  await audit({
    userId: params.actorId,
    action: 'SHIPMENT_CREATED',
    entityType: 'Shipment',
    entityId: shipment.id,
    newData: {
      orderNumber: order.orderNumber,
      trackingCode: result.trackingCode,
      weight,
      pieces: 1,
    },
    ...getRequestMeta(params.request),
  })

  return { shipment, reused: false, orderNumber: order.orderNumber }
}

interface ManualShipmentParams {
  orderId: string
  actorId: string
  trackingCode: string
  carrier?: string
  externalId?: string
  labelUrl?: string
  notes?: string
  request?: Request
}

/**
 * Repli manuel (§6.5) : un administrateur saisi le transporteur et le Code
 * Suivi quand l'API est indisponible. Le shipment est marqué `isManual` pour
 * qu'aucun rapprochement automatique ne prétende qu'il vient d'AMEEX.
 */
export async function createManualShipment(params: ManualShipmentParams) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { shipments: true },
  })
  if (!order) throw new ShipmentCreationError('Commande introuvable', 404)

  const trackingCode = params.trackingCode.trim()
  if (!trackingCode) throw new ShipmentCreationError('Le Code Suivi est obligatoire', 400)

  // §6.4 : jamais deux fois le même Code Suivi sur deux commandes.
  const duplicate = await prisma.shipment.findUnique({
    where: { trackingCode },
    include: { order: { select: { orderNumber: true } } },
  })
  if (duplicate) {
    throw new ShipmentCreationError(
      duplicate.orderId === order.id
        ? `Le Code Suivi ${trackingCode} est déjà enregistré sur cette commande.`
        : `Le Code Suivi ${trackingCode} est déjà rattaché à la commande ${duplicate.order.orderNumber}.`,
      409
    )
  }

  const shipment = await prisma.$transaction(async (tx) => {
    const created = await tx.shipment.create({
      data: {
        orderId: order.id,
        trackingCode,
        externalId: params.externalId ?? null,
        labelUrl: params.labelUrl ?? null,
        status: ShipmentStatus.CREATED,
        carrier: params.carrier || 'AMEEX',
        pieces: 1,
        codAmount: order.codAmount,
        idempotencyKey: generateIdempotencyKey(`manual_${order.id}_${trackingCode}`),
        isManual: true,
        createdById: params.actorId,
        pickupAddress: Prisma.JsonNull,
        deliveryAddress: {
          name: order.customerName,
          phone: order.customerPhone,
          address: order.customerAddress,
          city: order.customerCity,
          postalCode: order.customerPostalCode,
        },
      },
    })

    await tx.codCollection.updateMany({
      where: { orderId: order.id },
      data: { shipmentId: created.id },
    })

    await applyOrderTransition({
      orderId: order.id,
      to: 'SHIPMENT_CREATED',
      actorId: params.actorId,
      actorRole: 'ADMIN',
      notes: `Expédition saisie manuellement (${params.carrier || 'AMEEX'}) — ${params.notes ?? 'API indisponible'}`,
      tx,
    })

    return created
  })

  await notifyTrackingCodeAvailable(order.id, trackingCode, params.carrier || 'AMEEX')

  await audit({
    userId: params.actorId,
    action: 'SHIPMENT_CREATED_MANUAL',
    entityType: 'Shipment',
    entityId: shipment.id,
    newData: { orderNumber: order.orderNumber, trackingCode, carrier: shipment.carrier },
    ...getRequestMeta(params.request),
  })

  return shipment
}

export { OrderTransitionError }