'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export interface CartItem {
  productId: string
  name: string
  supplierId: string
  supplierName: string
  /** Prix fournisseur hors variante : le serveur y ajoute additionalPrice. */
  supplierPrice: number
  variantId?: string
  variantLabel?: string
  quantity: number
  resellerPrice: number
  image: string | null
}

interface CartContextValue {
  items: CartItem[]
  /** Vrai une fois le panier relu depuis le localStorage (évite tout écart SSR). */
  hydrated: boolean
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void
  updateItem: (productId: string, patch: Partial<Omit<CartItem, 'productId'>>, variantId?: string) => void
  removeItem: (productId: string, variantId?: string) => void
  clear: () => void
  count: number
  subtotal: number
}

const STORAGE_KEY = 'fabli-cart'

const CartContext = createContext<CartContextValue | null>(null)

/** Identité d'une ligne : un même produit avec deux variantes = deux lignes. */
function lineKey(productId: string, variantId?: string): string {
  return variantId ? `${productId}::${variantId}` : productId
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setItems(parsed as CartItem[])
      }
    } catch {
      // Panier corrompu : on repart d'un panier vide plutôt que de bloquer la page.
      window.localStorage.removeItem(STORAGE_KEY)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !hydrated) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items, hydrated])

  const addItem = useCallback<CartContextValue['addItem']>((item) => {
    const quantity = item.quantity ?? 1
    setItems((prev) => {
      const key = lineKey(item.productId, item.variantId)
      const existing = prev.find(
        (line) => lineKey(line.productId, line.variantId) === key
      )
      if (existing) {
        return prev.map((line) =>
          lineKey(line.productId, line.variantId) === key
            ? { ...line, quantity: line.quantity + quantity, resellerPrice: item.resellerPrice }
            : line
        )
      }
      return [...prev, { ...item, quantity }]
    })
  }, [])

  const updateItem = useCallback<CartContextValue['updateItem']>(
    (productId, patch, variantId) => {
      const key = lineKey(productId, variantId)
      setItems((prev) =>
        prev.map((line) => (lineKey(line.productId, line.variantId) === key ? { ...line, ...patch } : line))
      )
    },
    []
  )

  const removeItem = useCallback<CartContextValue['removeItem']>((productId, variantId) => {
    const key = lineKey(productId, variantId)
    setItems((prev) => prev.filter((line) => lineKey(line.productId, line.variantId) !== key))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const value = useMemo<CartContextValue>(() => {
    return {
      items,
      hydrated,
      addItem,
      updateItem,
      removeItem,
      clear,
      count: items.reduce((sum, line) => sum + line.quantity, 0),
      // Montant qui sera le sous-total « articles » de la commande (prix de revente).
      subtotal: items.reduce((sum, line) => sum + line.resellerPrice * line.quantity, 0),
    }
  }, [items, hydrated, addItem, updateItem, removeItem, clear])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart doit être utilisé à l\'intérieur d\'un <CartProvider>')
  }
  return context
}
