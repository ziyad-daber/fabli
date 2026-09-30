import { createHmac } from 'crypto'
import type { OrderStatus, Prisma, ShipmentStatus } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { resolveAmeexCredentials } from '@/lib/ameex/credentials'

const DEFAULT_BASE_URL = process.env.AMEEX_BASE_URL || 'https://api.ameex.app'
const REQUEST_TIMEOUT_MS = Number(process.env.AMEEX_TIMEOUT_MS || 15000)
const MAX_ATTEMPTS = Number(process.env.AMEEX_MAX_ATTEMPTS || 2)

/**
 * Client AMEEX.
 *
 * Invariants tenues ici (§6.5 du cahier des charges) :
 *  - délai d'attente maximal sur chaque appel (`AbortSignal.timeout`) ;
 *  - réessais contrôlés, uniquement sur erreurs réseau / 5xx / 429 ;
 *  - journalisation de chaque appel dans `CourierApiLog`, sans secret ni
 *    donnée personnelle inutile ;
 *  - les identifiants ne sont lus que côté serveur et ne sortent jamais d'ici.
 */

/** Champs de la requête qui ne sont jamais journalisés tels quels. */
const REDACTED_FIELDS = new Set(['phone', 'sender_phone', 'address', 'sender_address', 'cod', 'receiver'])

function redactForLog(payload: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(payload)) {
    out[key] = REDACTED_FIELDS.has(key) ? '[REDACTED]' : value
  }
  return out
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface ShipmentRequest {
  /** Référence interne de commande (§6.3). */
  orderReference: string
  recipient: {
    name: string
    /** Identifiant de ville AMEEX, pas un nom libre. */
    cityId: string
    cityLabel?: string
    phone: string
    address: string
    postalCode?: string
  }
  pickup?: {
    name: string
    phone: string
    address: string
    cityId: string
    cityLabel?: string
    postalCode?: string
    contactName?: string
  }
  pieces: number
  /** Poids total en kg. */
  weight: number
  length?: number
  width?: number
  height?: number
  /** Montant COD à encaisser (§6.3). */
  codAmount?: number
  currency?: string
  instructions?: string
  /** Clé d'idempotence serveur, transmise comme `exchange_code`. */
  idempotencyKey: string
  product?: string
  comment?: string
  productItems?: Array<{ id?: string; qty: number }>
}

export interface ShipmentResponse {
  success: boolean
  shipmentId?: string
  trackingCode?: string
  labelUrl?: string
  status?: string
  error?: string
  rawResponse?: unknown
  exchangeCode?: string
  price?: number
  deliveryTime?: string
  attempts?: number
}

export interface TrackingEvent {
  date: string
  status: string
  location?: string
  description: string
}

export interface TrackingResponse {
  success: boolean
  trackingCode: string
  status: string
  events?: TrackingEvent[]
  deliveredAt?: string
  codCollected?: number
  price?: number
  error?: string
}

export interface ApiCallLog {
  integrationId: string
  shipmentId?: string | null
  method: string
  endpoint: string
  requestBody?: Prisma.InputJsonValue
  responseBody?: Prisma.InputJsonValue
  statusCode?: number | null
  errorMessage?: string | null
  durationMs: number
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'DELETE'
  path: string
  query?: Record<string, string | number | undefined>
  form?: URLSearchParams
  /** Les appels non idempotents ne sont pas réessayés. */
  retry?: boolean
  shipmentId?: string | null
}

export class AmexAdapter {
  private integrationId: string
  private apiId: string
  private apiKey: string
  private accountId: string
  private baseUrl: string

  private constructor(params: {
    integrationId: string
    apiId: string
    apiKey: string
    accountId: string
    baseUrl: string
  }) {
    this.integrationId = params.integrationId
    this.apiId = params.apiId
    this.apiKey = params.apiKey
    this.accountId = params.accountId
    this.baseUrl = params.baseUrl || DEFAULT_BASE_URL
  }

  static async create(): Promise<AmexAdapter> {
    const creds = await resolveAmeexCredentials()
    if (!creds) {
      throw new Error('Intégration AMEEX non configurée. Renseignez-la depuis /dashboard/admin/ameex.')
    }
    if (!creds.apiKey || !creds.accountId) {
      throw new Error('Identifiants AMEEX incomplets (apiKey / accountId manquants).')
    }
    const integration = await prisma.courierIntegration.findFirst({
      where: { name: 'AMEEX' },
      select: { id: true },
    })
    return new AmexAdapter({
      integrationId: integration?.id ?? '',
      // AMEEX attend l'identifiant d'API dans C-Api-Id et la clé dans C-Api-Key.
      apiId: creds.apiKey,
      apiKey: creds.apiSecret || creds.apiKey,
      accountId: creds.accountId,
      baseUrl: creds.baseUrl,
    })
  }

  get isConfigured(): boolean {
    return this.integrationId.length > 0
  }

  private async log(entry: ApiCallLog): Promise<void> {
    if (!this.integrationId) return
    try {
      await prisma.courierApiLog.create({
        data: {
          integrationId: this.integrationId,
          shipmentId: entry.shipmentId ?? null,
          method: entry.method,
          endpoint: entry.endpoint,
          requestBody: entry.requestBody,
          responseBody: entry.responseBody,
          statusCode: entry.statusCode ?? null,
          errorMessage: entry.errorMessage ?? null,
          durationMs: entry.durationMs,
        },
      })
    } catch (error) {
      // La journalisation ne doit jamais faire échouer l'appel métier.
      console.error('[AMEEX] journalisation impossible', error)
    }
  }

  /**
   * Appel HTTP unifié : timeout, réessais, journalisation.
   */
  private async request<T = any>(options: RequestOptions): Promise<{
    ok: boolean
    status: number
    data: T | null
    error?: string
    attempts: number
  }> {
    const url = new URL(`${this.baseUrl}${options.path}`)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }

    const payload = options.form ? redactForLog(Object.fromEntries(options.form)) : undefined
    const canRetry = options.retry !== false
    let attempt = 0
    let lastError = ''
    let lastStatus = 0

    while (attempt < Math.max(1, MAX_ATTEMPTS)) {
      attempt += 1
      const startedAt = Date.now()
      let responseBody: unknown = null
      let networkError: string | null = null

      try {
        const res = await fetch(url.toString(), {
          method: options.method,
          headers: {
            'C-Api-Id': this.apiId,
            'C-Api-Key': this.apiKey,
            ...(options.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          },
          body: options.form ? options.form.toString() : undefined,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: 'no-store',
        })

        lastStatus = res.status
        const text = await res.text()
        if (text) {
          try {
            responseBody = JSON.parse(text)
          } catch {
            responseBody = { raw: text.slice(0, 2000) }
          }
        }

        await this.log({
          integrationId: this.integrationId,
          shipmentId: options.shipmentId ?? null,
          method: options.method,
          endpoint: options.path,
          requestBody: payload as Prisma.InputJsonValue | undefined,
          responseBody: responseBody as Prisma.InputJsonValue | undefined,
          statusCode: res.status,
          durationMs: Date.now() - startedAt,
        })

        const retryable = res.status >= 500 || res.status === 429
        if (!retryable) {
          return {
            ok: res.ok,
            status: res.status,
            data: responseBody as T | null,
            error: res.ok ? undefined : extractError(responseBody, res.status),
            attempts: attempt,
          }
        }
        lastError = extractError(responseBody, res.status)
      } catch (error) {
        networkError = error instanceof Error ? error.message : 'Erreur réseau'
        lastStatus = 0
        lastError = networkError

        await this.log({
          integrationId: this.integrationId,
          shipmentId: options.shipmentId ?? null,
          method: options.method,
          endpoint: options.path,
          requestBody: payload as Prisma.InputJsonValue | undefined,
          errorMessage: networkError,
          durationMs: Date.now() - startedAt,
        })
      }

      if (!canRetry || attempt >= MAX_ATTEMPTS) break
      // Backoff exponentiel court : le but est d'absorber un 429/5xx passager,
      // pas de masquer une panne durable.
      await sleep(400 * 2 ** (attempt - 1))
    }

    return { ok: false, status: lastStatus, data: null, error: lastError, attempts: attempt }
  }

  /**
   * Crée une expédition (§6.2 étape 3-4).
   * POST /customer/Delivery/Parcels/Action/Type/Add
   *
   * L'idempotence est portée par `exchange_code` : la même clé renvoie le même
   * colis côté AMEEX, donc un réessai après timeout ne duplique pas l'envoi.
   */
  async createShipment(request: ShipmentRequest): Promise<ShipmentResponse> {
    if (!request.recipient?.phone) {
      return { success: false, error: 'Téléphone du destinataire manquant' }
    }
    if (!request.recipient?.cityId) {
      return {
        success: false,
        error: "La ville du destinataire n'est pas rattachée à un identifiant AMEEX. Demandez à l'administrateur de l'associer dans Paramètres → Villes.",
      }
    }

    const form = new URLSearchParams()
    form.append('type', 'SIMPLE')
    form.append('business', this.accountId)
    form.append('exchange_code', request.idempotencyKey)
    form.append('order_num', request.orderReference)
    form.append('receiver', request.recipient.name)
    form.append('phone', request.recipient.phone)
    form.append('city', request.recipient.cityId)
    form.append('address', request.recipient.address)
    if (request.recipient.postalCode) form.append('postalcode', request.recipient.postalCode)

    if (request.pickup) {
      form.append('sender_name', request.pickup.name)
      form.append('sender_phone', request.pickup.phone)
      form.append('sender_address', request.pickup.address)
      form.append('sender_city', request.pickup.cityId)
      if (request.pickup.postalCode) form.append('sender_postalcode', request.pickup.postalCode)
      if (request.pickup.contactName) form.append('sender_contact', request.pickup.contactName)
    }

    form.append('number_of_parcels', String(request.pieces))
    form.append('weight', String(request.weight))
    if (request.length) form.append('length', String(request.length))
    if (request.width) form.append('width', String(request.width))
    if (request.height) form.append('height', String(request.height))

    form.append('open', 'YES')
    form.append('try', 'YES')
    form.append('fragile', '0')

    if (request.product) form.append('product', request.product)
    if (request.comment) form.append('comment', request.comment)
    // AMEEX attend le montant à encaisser dans `cod` ; c'est le total que le
    // client final règle au livreur (§5.7).
    form.append('cod', String(request.codAmount ?? 0))

    request.productItems?.forEach((item, index) => {
      if (item.id) form.append(`products[${index}][id]`, item.id)
      if (item.qty) form.append(`products[${index}][qty]`, String(item.qty))
    })

    const result = await this.request({
      method: 'POST',
      path: '/customer/Delivery/Parcels/Action/Type/Add',
      form,
      shipmentId: null,
    })

    if (!result.ok || !result.data) {
      return { success: false, error: result.error, rawResponse: result.data, attempts: result.attempts }
    }

    const data = result.data
    const trackingCode = data.parcel_code || data.ParcelCode || data.tracking_code || null

    if (!trackingCode) {
      return {
        success: false,
        error: 'Réponse AMEEX sans Code Suivi',
        rawResponse: data,
        attempts: result.attempts,
      }
    }

    return {
      success: true,
      shipmentId: trackingCode,
      trackingCode,
      labelUrl: data.label_url || data.labelUrl || null,
      status: data.status || 'CREATED',
      exchangeCode: data.exchange_code || request.idempotencyKey,
      price: data.price,
      deliveryTime: data.delivery_time || data.deliveryTime,
      rawResponse: data,
      attempts: result.attempts,
    }
  }

  /**
   * Met à jour un colis existant.
   * POST /customer/Delivery/Parcels/Action/Type/Edit
   */
  async editShipment(parcelCode: string, updates: Partial<ShipmentRequest>): Promise<ShipmentResponse> {
    const form = new URLSearchParams()
    form.append('exchange_code', updates.idempotencyKey ?? parcelCode)
    if (updates.orderReference) form.append('order_num', updates.orderReference)
    if (updates.recipient?.name) form.append('receiver', updates.recipient.name)
    if (updates.recipient?.phone) form.append('phone', updates.recipient.phone)
    if (updates.recipient?.cityId) form.append('city', updates.recipient.cityId)
    if (updates.recipient?.address) form.append('address', updates.recipient.address)
    if (updates.recipient?.postalCode) form.append('postalcode', updates.recipient.postalCode)
    if (updates.codAmount !== undefined) form.append('cod', String(updates.codAmount))
    if (updates.comment) form.append('comment', updates.comment)
    if (updates.pickup) {
      if (updates.pickup.name) form.append('sender_name', updates.pickup.name)
      if (updates.pickup.phone) form.append('sender_phone', updates.pickup.phone)
      if (updates.pickup.address) form.append('sender_address', updates.pickup.address)
      if (updates.pickup.cityId) form.append('sender_city', updates.pickup.cityId)
      if (updates.pickup.postalCode) form.append('sender_postalcode', updates.pickup.postalCode)
    }

    const result = await this.request({
      method: 'POST',
      path: '/customer/Delivery/Parcels/Action/Type/Edit',
      query: { ParcelCode: parcelCode },
      form,
      shipmentId: null,
    })

    if (!result.ok || !result.data) {
      return { success: false, error: result.error, rawResponse: result.data }
    }

    return {
      success: true,
      trackingCode: result.data.parcel_code || parcelCode,
      labelUrl: result.data.label_url || result.data.labelUrl || null,
      status: result.data.status || 'UPDATED',
      rawResponse: result.data,
      attempts: result.attempts,
    }
  }

  /**
   * Suivi d'un colis (§6.2 étape 6).
   * GET /customer/Delivery/Parcels/Tracking
   */
  async getTracking(trackingCode: string, shipmentId?: string | null): Promise<TrackingResponse> {
    const result = await this.request({
      method: 'GET',
      path: '/customer/Delivery/Parcels/Tracking',
      query: { ParcelCode: trackingCode },
      shipmentId: shipmentId ?? null,
    })

    if (!result.ok || !result.data) {
      return { success: false, trackingCode, status: 'ERROR', error: result.error }
    }

    const data = result.data
    const history: any[] = Array.isArray(data.history)
      ? data.history
      : Array.isArray(data.tracking)
        ? data.tracking
        : []

    const events: TrackingEvent[] = history.map((h: any) => ({
      date: h.date || h.datetime || '',
      status: h.status || h.statut || '',
      location: h.location || h.city,
      description: h.description || h.label || h.comment || '',
    }))

    return {
      success: true,
      trackingCode,
      status: data.status || data.statut || 'UNKNOWN',
      events,
      deliveredAt: data.delivered_at || data.deliveredAt || null,
      codCollected: data.cod_collected ?? data.codCollected ?? null,
      price: data.price ?? data.cod,
    }
  }

  /**
   * Détail d'un colis.
   * GET /customer/Delivery/Parcels/Info
   */
  async getParcelInfo(parcelCode: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const result = await this.request({
      method: 'GET',
      path: '/customer/Delivery/Parcels/Info',
      query: { ParcelCode: parcelCode },
    })
    return result.ok
      ? { success: true, data: result.data }
      : { success: false, error: result.error }
  }

  /**
   * Référence des statuts de colis acceptés par AMEEX.
   * GET /customer/Delivery/Parcels/Statuts
   */
  async getParcelStatuses(): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const result = await this.request({ method: 'GET', path: '/customer/Delivery/Parcels/Statuts' })
    return result.ok ? { success: true, data: result.data } : { success: false, error: result.error }
  }

  /**
   * Supprime un colis.
   * DELETE /customer/Delivery/Parcels/Action/Type/Delete
   */
  async deleteShipment(parcelCode: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.request({
      method: 'DELETE',
      path: '/customer/Delivery/Parcels/Action/Type/Delete',
      query: { ParcelCode: parcelCode },
      retry: false,
    })
    return result.ok ? { success: true } : { success: false, error: result.error }
  }

  /**
   * Relance un colis interrompu.
   * GET /customer/Delivery/Parcels/Action/Type/Relaunch
   */
  async relaunchShipment(parcelCode: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.request({
      method: 'GET',
      path: '/customer/Delivery/Parcels/Action/Type/Relaunch',
      query: { ParcelCode: parcelCode },
      retry: false,
    })
    return result.ok ? { success: true } : { success: false, error: result.error }
  }

  /**
   * Relance un colis en changeant le destinataire.
   * POST /customer/Delivery/Parcels/Action/Type/RelaunchNew
   */
  async relaunchShipmentNewCustomer(
    parcelCode: string,
    updates: { receiver: string; phone: string; city: string; address: string; price: number; comment?: string }
  ): Promise<{ success: boolean; error?: string }> {
    const form = new URLSearchParams()
    form.append('receiver', updates.receiver)
    form.append('phone', updates.phone)
    form.append('city', updates.city)
    form.append('address', updates.address)
    form.append('price', String(updates.price))
    if (updates.comment) form.append('comment', updates.comment)

    const result = await this.request({
      method: 'POST',
      path: '/customer/Delivery/Parcels/Action/Type/RelaunchNew',
      query: { ParcelCode: parcelCode },
      form,
      retry: false,
    })
    return result.ok ? { success: true } : { success: false, error: result.error }
  }

  /**
   * Liste paginée des colis du compte.
   * POST /customer/Delivery/Parcels/Json
   */
  async listParcels(
    filters: {
      start?: number
      length?: number
      search?: string
      business?: string
      statut?: string
      dateFrom?: string
      dateTo?: string
    } = {}
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const form = new URLSearchParams()
    form.append('start', String(filters.start ?? 0))
    form.append('length', String(filters.length ?? 20))
    form.append('search[value]', filters.search ?? '')
    form.append('search[regex]', 'false')
    if (filters.business) form.append('business', filters.business)
    if (filters.statut) form.append('statut', filters.statut)
    if (filters.dateFrom) form.append('date[from]', filters.dateFrom)
    if (filters.dateTo) form.append('date[to]', filters.dateTo)
    form.append('all_data', '0')

    const result = await this.request({
      method: 'POST',
      path: '/customer/Delivery/Parcels/Json',
      form,
    })
    return result.ok ? { success: true, data: result.data } : { success: false, error: result.error }
  }

  /**
   * URL d'étiquette. AMEEX n'expose pas d'endpoint dédié : l'URL est portée
   * par la réponse de création ou d'info.
   */
  async getLabelUrl(parcelCode: string): Promise<{ success: boolean; labelUrl?: string; error?: string }> {
    const info = await this.getParcelInfo(parcelCode)
    const data = info.data as Record<string, any> | null
    const labelUrl = data?.label_url || data?.labelUrl
    if (info.success && labelUrl) return { success: true, labelUrl }
    return { success: false, error: info.error || "URL d'étiquette absente de la réponse AMEEX" }
  }

  /**
   * Vérifie une signature webhook (HMAC-SHA256, comparaison à temps constant).
   * Le corps brut doit être transmis tel quel.
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    if (!signature || signature.trim() === '' || !secret) return false

    const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
    const provided = signature.trim().replace(/^sha256=/i, '').toLowerCase()

    if (provided.length !== expected.length) return false
    return timingSafeEqualHex(provided, expected)
  }

  /**
   * Traduit un statut AMEEX vers `ShipmentStatus`.
   * Une valeur inconnue devient ERROR : elle est signalée, jamais perdue.
   */
  mapShipmentStatus(rawStatus: string): ShipmentStatus {
    const normalized = String(rawStatus || '')
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_')

    const known: Record<string, ShipmentStatus> = {
      CREATED: 'CREATED',
      NEW: 'CREATED',
      PICKED_UP: 'PICKED_UP',
      PICKEDUP: 'PICKED_UP',
      COLLECTED: 'PICKED_UP',
      IN_TRANSIT: 'IN_TRANSIT',
      TRANSIT: 'IN_TRANSIT',
      OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
      OUTFORDELIVERY: 'OUT_FOR_DELIVERY',
      LIVRAISON: 'OUT_FOR_DELIVERY',
      DELIVERED: 'DELIVERED',
      LIVRE: 'DELIVERED',
      DELIVERY_FAILED: 'DELIVERY_FAILED',
      FAILED: 'DELIVERY_FAILED',
      RETURNED: 'RETURNED',
      RETOURNE: 'RETURNED',
      ERROR: 'ERROR',
    }

    return known[normalized] ?? 'ERROR'
  }

  /** Statut de commande impliqué par un statut d'expédition. */
  mapOrderStatus(shipmentStatus: ShipmentStatus): OrderStatus | null {
    switch (shipmentStatus) {
      case 'PICKED_UP':
      case 'IN_TRANSIT':
      case 'OUT_FOR_DELIVERY':
        return 'IN_TRANSIT'
      case 'DELIVERED':
        return 'DELIVERED'
      case 'DELIVERY_FAILED':
        return 'DELIVERY_FAILED'
      case 'RETURNED':
        return 'RETURNED'
      case 'ERROR':
        return 'SHIPMENT_ERROR'
      default:
        // CREATED correspond déjà à OrderStatus.SHIPMENT_CREATED.
        return null
    }
  }
}

function extractError(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>
    const message = p.message || p.error || p.detail
    if (typeof message === 'string' && message) return message
  }
  return `AMEEX a répondu HTTP ${status}`
}

/** Raccourci : construit un adaptateur configuré, ou `null` si l'intégration manque. */
export async function tryCreateAmeexAdapter(): Promise<AmexAdapter | null> {
  try {
    return await AmexAdapter.create()
  } catch {
    return null
  }
}