/**
 * Calcul des prix, commissions et marges (§5.6).
 *
 * Définition retenue, alignée sur l'exemple du cahier des charges :
 *   prix fournisseur 100, prix revendeur 180, livraison 30
 *   commission = 10 % du prix fournisseur = 10
 *   marge brute du revendeur = prix revendeur − prix fournisseur = 80
 *   total client = prix revendeur + livraison = 210
 *
 * La marge brute est donc calculée **avant** commission plateforme : c'est ce
 * que le cahier des charges appelle « marge brute estimée ». La marge nette,
 * ce qui reste réellement au revendeur après la commission, est exposée à
 * part pour éviter toute ambiguïté dans les écrans.
 *
 * Commission = prix fournisseur × taux. Elle porte donc sur le prix de gros,
 * pas sur le prix de vente.
 */

export interface CommissionCalculation {
  commissionRate: number // ex. 0.10 pour 10 %
  supplierPrice: number
  resellerPrice: number
  shippingFee: number
  currency: string
}

export interface CommissionResult {
  commissionAmount: number
  /** Marge brute du revendeur : revente − prix fournisseur. */
  resellerMargin: number
  /** Marge restant au revendeur après commission plateforme. */
  netResellerMargin: number
  resellerMarginPercent: number
  clientTotal: number
  breakdown: {
    supplierPrice: number
    resellerPrice: number
    shippingFee: number
    commissionRate: number
    commissionAmount: number
    resellerMargin: number
    netResellerMargin: number
  }
}

export function calculateCommission(params: CommissionCalculation): CommissionResult {
  const { commissionRate, supplierPrice, resellerPrice, shippingFee } = params

  const commissionAmount = round2(supplierPrice * commissionRate)
  const resellerMargin = round2(resellerPrice - supplierPrice)
  const netResellerMargin = round2(resellerMargin - commissionAmount)
  const resellerMarginPercent =
    resellerPrice > 0 ? round2((resellerMargin / resellerPrice) * 100) : 0
  const clientTotal = round2(resellerPrice + shippingFee)

  return {
    commissionAmount,
    resellerMargin,
    netResellerMargin,
    resellerMarginPercent,
    clientTotal,
    breakdown: {
      supplierPrice,
      resellerPrice,
      shippingFee,
      commissionRate,
      commissionAmount,
      resellerMargin,
      netResellerMargin,
    },
  }
}

export interface OrderItemCalculation {
  productId: string
  variantId?: string
  quantity: number
  supplierPrice: number
  resellerPrice: number
}

export interface CalculatedOrderItem extends OrderItemCalculation {
  totalSupplierPrice: number
  totalResellerPrice: number
  totalCommission: number
  totalGrossMargin: number
}

export interface OrderCommissionResult {
  items: CalculatedOrderItem[]
  /** Somme des prix de revente : c'est le montant que le client règle, hors livraison. */
  subtotal: number
  totalCommission: number
  totalSupplierPrice: number
  totalResellerPrice: number
  totalGrossMargin: number
  totalNetMargin: number
}

export function calculateOrderCommission(
  items: OrderItemCalculation[],
  commissionRate: number
): OrderCommissionResult {
  const calculatedItems: CalculatedOrderItem[] = items.map((item) => {
    const totalSupplierPrice = round2(item.supplierPrice * item.quantity)
    const totalResellerPrice = round2(item.resellerPrice * item.quantity)
    const totalCommission = round2(totalSupplierPrice * commissionRate)

    return {
      ...item,
      totalSupplierPrice,
      totalResellerPrice,
      totalCommission,
      totalGrossMargin: round2(totalResellerPrice - totalSupplierPrice),
    }
  })

  const totalSupplierPrice = sum(calculatedItems.map((i) => i.totalSupplierPrice))
  const totalResellerPrice = sum(calculatedItems.map((i) => i.totalResellerPrice))
  const totalCommission = sum(calculatedItems.map((i) => i.totalCommission))
  const totalGrossMargin = round2(totalResellerPrice - totalSupplierPrice)

  return {
    items: calculatedItems,
    subtotal: totalResellerPrice,
    totalCommission,
    totalSupplierPrice,
    totalResellerPrice,
    totalGrossMargin,
    totalNetMargin: round2(totalGrossMargin - totalCommission),
  }
}

/**
 * Taux de commission effectif de la plateforme, en pourcentage.
 * La valeur stockée est une fraction (0.10 = 10 %).
 */
export function getCommissionRate(): Promise<number> {
  return import('@/lib/db/prisma').then(async ({ prisma }) => {
    const setting = await prisma.platformSetting.findUnique({
      where: { key: 'commission_rate' },
    })
    const parsed = setting ? Number(setting.value) : DEFAULT_COMMISSION_RATE
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_COMMISSION_RATE
  })
}

export const DEFAULT_COMMISSION_RATE = 0.1

export function formatCurrency(amount: number, currency = 'MAD'): string {
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function parseDecimal(value: string | number): number {
  if (typeof value === 'number') return value
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Arrondi à deux décimales, stable sur les montants.
 *
 * `Math.round(1.005 * 100)` vaut 100 en IEEE-754, car 1.005 * 100 vaut
 * 100.49999999999999. Passer par la notation exponentielle impose un
 * arrondi décimal correct avant le Math.round.
 */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(Number(`${value}e2`)) / 100
}

function sum(values: number[]): number {
  return round2(values.reduce((acc, value) => acc + value, 0))
}