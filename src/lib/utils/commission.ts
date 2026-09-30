export interface CommissionCalculation {
  commissionRate: number // e.g., 0.10 for 10%
  supplierPrice: number
  resellerPrice: number
  shippingFee: number
  currency: string
}

export interface CommissionResult {
  commissionAmount: number
  resellerMargin: number
  resellerMarginPercent: number
  clientTotal: number
  breakdown: {
    supplierPrice: number
    resellerPrice: number
    shippingFee: number
    commissionRate: number
    commissionAmount: number
  }
}

/**
 * Calculate commission based on platform settings
 * Formula: Commission = Supplier Price × Commission Rate
 * Reseller Margin = Reseller Price - Supplier Price - Commission
 * Client Total = Reseller Price + Shipping Fee
 */
export function calculateCommission(params: CommissionCalculation): CommissionResult {
  const { commissionRate, supplierPrice, resellerPrice, shippingFee, currency } = params
  
  const commissionAmount = Number((supplierPrice * commissionRate).toFixed(2))
  const resellerMargin = Number((resellerPrice - supplierPrice - commissionAmount).toFixed(2))
  const resellerMarginPercent = resellerPrice > 0 
    ? Number(((resellerMargin / resellerPrice) * 100).toFixed(1))
    : 0
  const clientTotal = Number((resellerPrice + shippingFee).toFixed(2))

  return {
    commissionAmount,
    resellerMargin,
    resellerMarginPercent,
    clientTotal,
    breakdown: {
      supplierPrice,
      resellerPrice,
      shippingFee,
      commissionRate,
      commissionAmount,
    }
  }
}

/**
 * Calculate commission for order items (multiple products)
 */
export interface OrderItemCalculation {
  productId: string
  variantId?: string
  quantity: number
  supplierPrice: number
  resellerPrice: number
}

export interface OrderCommissionResult {
  items: Array<OrderItemCalculation & { 
    totalSupplierPrice: number
    totalResellerPrice: number
    totalCommission: number
  }>
  subtotal: number
  totalCommission: number
  totalSupplierPrice: number
  totalResellerPrice: number
}

export function calculateOrderCommission(
  items: OrderItemCalculation[],
  commissionRate: number
): OrderCommissionResult {
  const calculatedItems = items.map(item => {
    const totalSupplierPrice = Number((item.supplierPrice * item.quantity).toFixed(2))
    const totalResellerPrice = Number((item.resellerPrice * item.quantity).toFixed(2))
    const totalCommission = Number((totalSupplierPrice * commissionRate).toFixed(2))
    
    return {
      ...item,
      totalSupplierPrice,
      totalResellerPrice,
      totalCommission,
    }
  })

  const subtotal = Number(calculatedItems.reduce((sum, item) => sum + item.totalResellerPrice, 0).toFixed(2))
  const totalCommission = Number(calculatedItems.reduce((sum, item) => sum + item.totalCommission, 0).toFixed(2))
  const totalSupplierPrice = Number(calculatedItems.reduce((sum, item) => sum + item.totalSupplierPrice, 0).toFixed(2))
  const totalResellerPrice = Number(calculatedItems.reduce((sum, item) => sum + item.totalResellerPrice, 0).toFixed(2))

  return {
    items: calculatedItems,
    subtotal,
    totalCommission,
    totalSupplierPrice,
    totalResellerPrice,
  }
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency = 'MAD'): string {
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Parse decimal string to number safely
 */
export function parseDecimal(value: string | number): number {
  if (typeof value === 'number') return value
  const parsed = parseFloat(value)
  return isNaN(parsed) ? 0 : parsed
}

/**
 * Round to 2 decimal places
 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}