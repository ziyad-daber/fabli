import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { randomBytes, randomInt } from 'crypto'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | string, currency = 'MAD'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-MA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  })
}

export function formatDateTime(date: Date | string): string {
  return formatDate(date, { hour: '2-digit', minute: '2-digit' })
}

export function generateOrderNumber(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0')
  return `FAB-${year}-${random}`
}

/**
 * Clé d'idempotence d'une expédition.
 * Transmise à AMEEX comme `exchange_code` : un double clic ou un réessai après
 * timeout ne crée pas de doublon côté transporteur.
 */
export function generateIdempotencyKey(prefix = 'ship'): string {
  return `${prefix}_${Date.now()}_${randomBytes(6).toString('hex')}`
}