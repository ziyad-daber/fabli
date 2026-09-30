import { prisma } from '@/lib/db/prisma'
import { createHmac } from 'crypto'
import type { OrderStatus, ShipmentStatus } from '@prisma/client'

const AMEEX_BASE_URL = 'https://api.ameex.app'

/**
 * Constant-time string comparison. Both inputs must already be the same
 * length; the loop accumulates differences so no early exit leaks position.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false

  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }

  return diff === 0
}

interface AmexCredentials {
  apiKey: string
  accountId: string
  baseUrl?: string
}

async function getCredentials(): Promise<AmexCredentials> {
  const integration = await prisma.courierIntegration.findFirst({
    where: { name: 'AMEEX' },
  })
  if (!integration || !integration.apiKey || !integration.accountId) {
    throw new Error('AMEEX credentials not configured')
  }
  return {
    apiKey: integration.apiKey,
    accountId: integration.accountId,
    baseUrl: integration.baseUrl || AMEEX_BASE_URL,
  }
}

function getHeaders(creds: AmexCredentials) {
  return {
    'C-Api-Id': creds.apiKey,
    'C-Api-Key': creds.accountId,
  }
}

export interface ShipmentRequest {
  orderReference: string
  recipient: {
    name: string
    phone: string
    email?: string
    address: string
    city: string
    postalCode?: string
  }
  pickup?: {
    name: string
    phone: string
    address: string
    city: string
    postalCode?: string
    contactName?: string
  }
  pieces: number
  weight: number // in kg
  length?: number // in cm
  width?: number // in cm
  height?: number // in cm
  codAmount?: number
  currency?: string
  instructions?: string
  idempotencyKey: string
  product?: string
  orderNum?: string
  comment?: string
  exchangeCode?: string
  // Additional fields for products array
  productItems?: Array<{
    id?: string
    qty: number
  }>
}

export interface ShipmentResponse {
  success: boolean
  shipmentId?: string
  trackingCode?: string
  labelUrl?: string
  status?: string
  error?: string
  rawResponse?: unknown
  // Additional fields from AMEEX response
  exchangeCode?: string
  price?: number
  deliveryTime?: string
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

export interface ParcelInfoResponse {
  success: boolean
  data?: any
  error?: string
}

export class AmexAdapter {
  private creds: AmexCredentials
  private baseUrl: string

  constructor(creds: AmexCredentials) {
    this.creds = creds
    this.baseUrl = creds.baseUrl || AMEEX_BASE_URL
  }

  /**
   * Create a new shipment via AMEEX API
   * Endpoint: POST /customer/Delivery/Parcels/Action/Type/Add
   */
  async createShipment(request: ShipmentRequest): Promise<ShipmentResponse> {
    const form = new URLSearchParams()

    // Required fields
    form.append('type', 'SIMPLE')
    form.append('business', this.creds.accountId)
    form.append('receiver', request.recipient.name)
    form.append('phone', request.recipient.phone)
    form.append('city', String(request.recipient.city))
    form.append('address', request.recipient.address)

    // Optional fields
    if (request.orderReference) form.append('order_num', request.orderReference)
    if (request.orderNum) form.append('order_num', request.orderNum) // Override if provided
    if (request.exchangeCode) form.append('exchange_code', request.exchangeCode)
    if (request.comment) form.append('comment', request.comment)
    if (request.product) form.append('product', request.product)
    if (request.codAmount !== undefined) form.append('cod', String(request.codAmount))

    // Pickup information (if provided)
    if (request.pickup) {
      form.append('sender_name', request.pickup.name)
      form.append('sender_phone', request.pickup.phone)
      form.append('sender_address', request.pickup.address)
      form.append('sender_city', request.pickup.city)
      if (request.pickup.postalCode) form.append('sender_postalcode', request.pickup.postalCode)
      if (request.pickup.contactName) form.append('sender_contact', request.pickup.contactName)
    }

    // Package details
    form.append('number_of_parcels', String(request.pieces))
    if (request.weight !== undefined) form.append('weight', String(request.weight))
    if (request.length !== undefined) form.append('length', String(request.length))
    if (request.width !== undefined) form.append('width', String(request.width))
    if (request.height !== undefined) form.append('height', String(request.height))

    // Additional options
    form.append('open', 'YES')
    form.append('try', 'YES')
    form.append('fragile', '0') // 0 = not fragile, 1 = fragile

    // Products array (if provided)
    if (request.productItems && request.productItems.length > 0) {
      request.productItems.forEach((item, index) => {
        if (item.id) form.append(`products[${index}][id]`, item.id)
        if (item.qty) form.append(`products[${index}][qty]`, String(item.qty))
      })
    }

    try {
      const res = await fetch(`${this.baseUrl}/customer/Delivery/Parcels/Action/Type/Add`, {
        method: 'POST',
        headers: {
          ...getHeaders(this.creds),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      })

      const data = await res.json().catch(() => null)

      if (res.status === 200 && data) {
        return {
          success: true,
          shipmentId: data.parcel_code || data.ParcelCode,
          trackingCode: data.parcel_code || data.ParcelCode,
          labelUrl: data.label_url || data.labelUrl,
          status: data.status || 'CREATED',
          exchangeCode: data.exchange_code || data.ExchangeCode,
          price: data.price || data.cod,
          deliveryTime: data.delivery_time || data.deliveryTime,
          rawResponse: data,
        }
      }

      return {
        success: false,
        error: data?.message || `HTTP ${res.status}: ${res.statusText}`,
        rawResponse: data,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create shipment',
      }
    }
  }

  /**
   * Edit an existing shipment
   * Endpoint: POST /customer/Delivery/Parcels/Action/Type/Edit
   */
  async editShipment(parcelCode: string, request: Partial<ShipmentRequest>): Promise<ShipmentResponse> {
    const form = new URLSearchParams()
    form.append('exchange_code', request.exchangeCode || '')

    // Only include fields that are provided
    if (request.recipient?.name) form.append('receiver', request.recipient.name)
    if (request.recipient?.phone) form.append('phone', request.recipient.phone)
    if (request.recipient?.city) form.append('city', String(request.recipient.city))
    if (request.recipient?.address) form.append('address', request.recipient.address)
    if (request.recipient?.postalCode) form.append('postalcode', request.recipient.postalCode)

    if (request.orderNum) form.append('order_num', request.orderNum)
    if (request.comment) form.append('comment', request.comment)
    if (request.product) form.append('product', request.product)
    if (request.codAmount !== undefined) form.append('cod', String(request.codAmount))

    // Pickup information
    if (request.pickup) {
      if (request.pickup.name) form.append('sender_name', request.pickup.name)
      if (request.pickup.phone) form.append('sender_phone', request.pickup.phone)
      if (request.pickup.address) form.append('sender_address', request.pickup.address)
      if (request.pickup.city) form.append('sender_city', request.pickup.city)
      if (request.pickup.postalCode) form.append('sender_postalcode', request.pickup.postalCode)
      if (request.pickup.contactName) form.append('sender_contact', request.pickup.contactName)
    }

    try {
      const res = await fetch(
        `${this.baseUrl}/customer/Delivery/Parcels/Action/Type/Edit?ParcelCode=${encodeURIComponent(parcelCode)}`,
        {
          method: 'POST',
          headers: {
            ...getHeaders(this.creds),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        }
      )

      const data = await res.json().catch(() => null)

      if (res.status === 200 && data) {
        return {
          success: true,
          shipmentId: data.parcel_code || data.ParcelCode,
          trackingCode: data.parcel_code || data.ParcelCode,
          labelUrl: data.label_url || data.labelUrl,
          status: data.status || 'UPDATED',
          rawResponse: data,
        }
      }

      return {
        success: false,
        error: data?.message || `HTTP ${res.status}: ${res.statusText}`,
        rawResponse: data,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to edit shipment',
      }
    }
  }

  /**
   * Get shipment tracking information
   * Endpoint: GET /customer/Delivery/Parcels/Tracking
   */
  async getTracking(trackingCode: string): Promise<TrackingResponse> {
    try {
      const res = await fetch(
        `${this.baseUrl}/customer/Delivery/Parcels/Tracking?ParcelCode=${encodeURIComponent(trackingCode)}`,
        {
          method: 'GET',
          headers: getHeaders(this.creds),
        }
      )

      const data = await res.json().catch(() => null)

      if (res.status === 200 && data) {
        const events: TrackingEvent[] = Array.isArray(data.history)
          ? data.history.map((h: any) => ({
              date: h.date || '',
              status: h.status || '',
              location: h.location,
              description: h.description || h.label || '',
            }))
          : []

        return {
          success: true,
          trackingCode,
          status: data.status || 'UNKNOWN',
          events,
          deliveredAt: data.delivered_at || data.deliveredAt,
          codCollected: data.cod_collected || data.codCollected,
          price: data.price || data.cod,
        }
      }

      return {
        success: false,
        trackingCode,
        status: 'ERROR',
        error: data?.message || `HTTP ${res.status}`,
      }
    } catch (error) {
      return {
        success: false,
        trackingCode: trackingCode,
        status: 'ERROR',
        error: error instanceof Error ? error.message : 'Failed to fetch tracking',
      }
    }
  }

  /**
   * Get parcel info
   * Endpoint: GET /customer/Delivery/Parcels/Info
   */
  async getParcelInfo(parcelCode: string): Promise<ParcelInfoResponse> {
    try {
      const res = await fetch(
        `${this.baseUrl}/customer/Delivery/Parcels/Info?ParcelCode=${encodeURIComponent(parcelCode)}`,
        {
          method: 'GET',
          headers: getHeaders(this.creds),
        }
      )

      const data = await res.json().catch(() => null)

      if (res.status === 200) {
        return { success: true, data }
      }

      return {
        success: false,
        error: data?.message || `HTTP ${res.status}`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch parcel info',
      }
    }
  }

  /**
   * Get parcel status
   * Endpoint: GET /customer/Delivery/Parcels/Statuts
   */
  async getParcelStatus(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(
        `${this.baseUrl}/customer/Delivery/Parcels/Statuts`,
        {
          method: 'GET',
          headers: getHeaders(this.creds),
        }
      )

      const data = await res.json().catch(() => null)

      if (res.status === 200) {
        return { success: true, data }
      }

      return {
        success: false,
        error: data?.message || `HTTP ${res.status}`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch parcel statuses',
      }
    }
  }

  /**
   * Delete a parcel
   * Endpoint: DELETE /customer/Delivery/Parcels/Action/Type/Delete
   */
  async deleteShipment(parcelCode: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(
        `${this.baseUrl}/customer/Delivery/Parcels/Action/Type/Delete?ParcelCode=${encodeURIComponent(parcelCode)}`,
        {
          method: 'DELETE',
          headers: getHeaders(this.creds),
        }
      )

      if (res.status === 200) {
        return { success: true }
      }

      const data = await res.json().catch(() => null)
      return {
        success: false,
        error: data?.message || `HTTP ${res.status}`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete shipment',
      }
    }
  }

  /**
   * Relaunch a parcel
   * Endpoint: GET /customer/Delivery/Parcels/Action/Type/Relaunch
   */
  async relaunchShipment(parcelCode: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(
        `${this.baseUrl}/customer/Delivery/Parcels/Action/Type/Relaunch?ParcelCode=${encodeURIComponent(parcelCode)}`,
        {
          method: 'GET',
          headers: getHeaders(this.creds),
        }
      )

      if (res.status === 200) {
        return { success: true }
      }

      const data = await res.json().catch(() => null)
      return {
        success: false,
        error: data?.message || `HTTP ${res.status}`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to relaunch shipment',
      }
    }
  }

  /**
   * Relaunch parcel with new customer
   * Endpoint: POST /customer/Delivery/Parcels/Action/Type/RelaunchNew
   */
  async relaunchShipmentNewCustomer(parcelCode: string, request: {
    receiver: string
    phone: string
    city: string
    address: string
    price: number
    comment?: string
  }): Promise<{ success: boolean; error?: string }> {
    const form = new URLSearchParams()
    form.append('receiver', request.receiver)
    form.append('phone', request.phone)
    form.append('city', String(request.city))
    form.append('address', request.address)
    form.append('price', String(request.price))
    if (request.comment) form.append('comment', request.comment)

    try {
      const res = await fetch(
        `${this.baseUrl}/customer/Delivery/Parcels/Action/Type/RelaunchNew?ParcelCode=${encodeURIComponent(parcelCode)}`,
        {
          method: 'POST',
          headers: {
            ...getHeaders(this.creds),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        }
      )

      if (res.status === 200) {
        return { success: true }
      }

      const data = await res.json().catch(() => null)
      return {
        success: false,
        error: data?.message || `HTTP ${res.status}`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to relaunch shipment with new customer',
      }
    }
  }

  /**
   * Get parcels list (mass tracking)
   * Endpoint: POST /customer/Delivery/Parcels/Json
   */
  async getParcelsList(filters: {
    start?: number
    length?: number
    search?: string
    business?: string
    statut?: string
    dateFrom?: string
    dateTo?: string
  } = {}): Promise<{ success: boolean; data?: any; error?: string }> {
    const form = new URLSearchParams()
    form.append('start', String(filters.start ?? 0))
    form.append('length', String(filters.length ?? 10))
    if (filters.search) form.append('search[value]', filters.search)
    form.append('search[regex]', 'false')
    if (filters.business) form.append('business', filters.business)
    if (filters.statut) form.append('statut', filters.statut)
    if (filters.dateFrom) form.append('date[from]', filters.dateFrom)
    if (filters.dateTo) form.append('date[to]', filters.dateTo)
    form.append('all_data', '0')

    try {
      const res = await fetch(
        `${this.baseUrl}/customer/Delivery/Parcels/Json`,
        {
          method: 'POST',
          headers: {
            ...getHeaders(this.creds),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        }
      )

      const data = await res.json().catch(() => null)

      if (res.status === 200) {
        return { success: true, data }
      }

      return {
        success: false,
        error: data?.message || `HTTP ${res.status}`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch parcels list',
      }
    }
  }

  /**
   * Generate shipping label
   * Note: AMEEX doesn't have a dedicated label endpoint, so we use Info endpoint
   */
  async generateLabel(shipmentId: string): Promise<{ success: boolean; labelUrl?: string; error?: string }> {
    try {
      const res = await fetch(
        `${this.baseUrl}/customer/Delivery/Parcels/Info?ParcelCode=${encodeURIComponent(shipmentId)}`,
        {
          method: 'GET',
          headers: getHeaders(this.creds),
        }
      )

      const data = await res.json().catch(() => null)
      const labelUrl = data?.label_url || data?.labelUrl

      if (res.status === 200 && labelUrl) {
        return { success: true, labelUrl }
      }

      return {
        success: false,
        error: data?.message || 'Label URL not found in response',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate label',
      }
    }
  }

  /**
   * Cancel shipment (alias for delete)
   */
  async cancelShipment(shipmentId: string, reason: string): Promise<{ success: boolean; error?: string }> {
    return this.deleteShipment(shipmentId)
  }

  /**
   * Verify a webhook signature using HMAC-SHA256 and a timing-safe comparison.
   *
   * The raw request body must be passed verbatim: any re-serialisation changes
   * the bytes and the digest will not match.
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    if (!signature || signature.trim() === '' || !secret) {
      return false
    }

    const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('hex')

    // Accept both the bare hex digest and a "sha256=<digest>" prefixed form
    const provided = signature.trim().replace(/^sha256=/i, '').toLowerCase()

    if (provided.length !== expected.length) {
      return false
    }

    return timingSafeEqualHex(provided, expected)
  }

  /**
   * Map an AMEEX parcel status onto our internal ShipmentStatus enum.
   * Unknown values fall back to ERROR so they are surfaced rather than dropped.
   */
  mapShipmentStatus(rawStatus: string): ShipmentStatus {
    const normalized = String(rawStatus || '').trim().toUpperCase().replace(/[\s-]+/g, '_')

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

  /**
   * Derive the Order status implied by a shipment status.
   */
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
        // CREATED is already represented by OrderStatus.SHIPMENT_CREATED
        return null
    }
  }

  /**
   * Parse webhook payload
   */
  parseWebhook(payload: unknown): { eventType: string; data: unknown } | null {
    if (!payload || typeof payload !== 'object') return null
    const p = payload as Record<string, unknown>
    return {
      eventType: (p.event_type as string) || (p.type as string) || 'unknown',
      data: p,
    }
  }
}

export async function createAmeexAdapter(): Promise<AmexAdapter> {
  const creds = await getCredentials()
  return new AmexAdapter(creds)
}