import {
  calculateCommission,
  calculateOrderCommission,
  round2,
  parseDecimal,
} from '@/lib/utils/commission'

describe('calculateCommission — §5.6 du cahier des charges', () => {
  it('reproduit l\'exemple chiffré du cahier des charges', () => {
    // prix fournisseur 100, prix revendeur 180, livraison 30, commission 10 %
    const result = calculateCommission({
      commissionRate: 0.1,
      supplierPrice: 100,
      resellerPrice: 180,
      shippingFee: 30,
      currency: 'MAD',
    })

    // Commission = 10 % du prix fournisseur
    expect(result.commissionAmount).toBe(10)
    // Marge brute = revente − prix fournisseur
    expect(result.resellerMargin).toBe(80)
    // Marge nette = marge brute − commission
    expect(result.netResellerMargin).toBe(70)
    // Total client = prix de revente + livraison
    expect(result.clientTotal).toBe(210)
  })

  it('calcule le pourcentage de marge sur le prix de revente', () => {
    const result = calculateCommission({
      commissionRate: 0.1,
      supplierPrice: 100,
      resellerPrice: 200,
      shippingFee: 0,
      currency: 'MAD',
    })

    expect(result.resellerMarginPercent).toBe(50)
  })

  it('ne divise pas par un prix de revente nul', () => {
    const result = calculateCommission({
      commissionRate: 0.1,
      supplierPrice: 100,
      resellerPrice: 0,
      shippingFee: 0,
      currency: 'MAD',
    })

    expect(result.resellerMarginPercent).toBe(0)
    expect(result.resellerMargin).toBe(-100)
  })

  it('produit une marge nette négative quand la commission dépasse la marge', () => {
    // 10 % de commission sur 100 MAD de prix fournisseur, revente à 105 MAD
    const result = calculateCommission({
      commissionRate: 0.1,
      supplierPrice: 100,
      resellerPrice: 105,
      shippingFee: 0,
      currency: 'MAD',
    })

    expect(result.resellerMargin).toBe(5)
    expect(result.netResellerMargin).toBe(-5)
  })

  it('arrondit à deux décimales', () => {
    const result = calculateCommission({
      commissionRate: 0.075,
      supplierPrice: 33.33,
      resellerPrice: 66.66,
      shippingFee: 5.555,
      currency: 'MAD',
    })

    expect(result.commissionAmount).toBe(2.5)
    expect(result.resellerMargin).toBe(33.33)
    expect(result.clientTotal).toBe(72.22)
  })
})

describe('calculateOrderCommission', () => {
  const rate = 0.1

  it('agrège une commande multi-lignes', () => {
    const result = calculateOrderCommission(
      [
        { productId: 'a', quantity: 2, supplierPrice: 100, resellerPrice: 180 },
        { productId: 'b', quantity: 1, supplierPrice: 40, resellerPrice: 80 },
      ],
      rate
    )

    expect(result.totalSupplierPrice).toBe(240)
    expect(result.totalResellerPrice).toBe(440)
    // 20 + 4
    expect(result.totalCommission).toBe(24)
    // 440 − 240
    expect(result.totalGrossMargin).toBe(200)
    // 200 − 24
    expect(result.totalNetMargin).toBe(176)
    expect(result.subtotal).toBe(440)
  })

  it('porte le prix des variantes dans le prix de gros', () => {
    // Le prix fournisseur de la ligne inclut déjà l'extra de variante.
    const result = calculateOrderCommission(
      [{ productId: 'a', variantId: 'v', quantity: 3, supplierPrice: 110, resellerPrice: 150 }],
      rate
    )

    expect(result.totalSupplierPrice).toBe(330)
    expect(result.totalCommission).toBe(33)
  })

  it('renvoie des totaux à zéro sur une liste vide', () => {
    const result = calculateOrderCommission([], rate)

    expect(result.totalSupplierPrice).toBe(0)
    expect(result.totalResellerPrice).toBe(0)
    expect(result.totalCommission).toBe(0)
    expect(result.totalGrossMargin).toBe(0)
    expect(result.totalNetMargin).toBe(0)
    expect(result.items).toEqual([])
  })

  it('préserve la cohérence entre somme des lignes et total général', () => {
    const items = [
      { productId: 'a', quantity: 3, supplierPrice: 12.5, resellerPrice: 24.99 },
      { productId: 'b', quantity: 7, supplierPrice: 3.33, resellerPrice: 9.99 },
      { productId: 'c', quantity: 1, supplierPrice: 250, resellerPrice: 500 },
    ]

    const result = calculateOrderCommission(items, 0.1)
    const sumOfLines = result.items.reduce((sum, item) => sum + item.totalCommission, 0)

    expect(round2(sumOfLines)).toBe(result.totalCommission)
  })
})

describe('utilitaires', () => {
  it('arrondit à deux décimales sans erreur de flottant', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3)
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.675)).toBe(2.68)
  })

  it('convertit les Decimal Prisma en nombre', () => {
    expect(parseDecimal('123.45')).toBe(123.45)
    expect(parseDecimal(42)).toBe(42)
    expect(parseDecimal('invalide')).toBe(0)
  })
})