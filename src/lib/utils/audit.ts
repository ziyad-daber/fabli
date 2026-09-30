import { prisma } from '@/lib/db/prisma'
import type { Prisma } from '@prisma/client'

/**
 * Journalisation des actions sensibles (§9 : "journalisation des actions
 * sensibles"). Ne doit jamais faire échouer l'action métier auditée : les
 * erreurs sont remontées sur la console, pas propagées.
 */
export interface AuditInput {
  userId?: string | null
  action: string
  entityType: string
  entityId: string
  oldData?: unknown
  newData?: unknown
  ipAddress?: string | null
  userAgent?: string | null
}

export function getRequestMeta(request?: Request): { ipAddress: string | null; userAgent: string | null } {
  if (!request) return { ipAddress: null, userAgent: null }
  const forwarded = request.headers.get('x-forwarded-for')
  return {
    ipAddress: forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip'),
    userAgent: request.headers.get('user-agent'),
  }
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        oldData: (input.oldData ?? undefined) as Prisma.InputJsonValue | undefined,
        newData: (input.newData ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    })
  } catch (error) {
    console.error('[Audit] échec journalisation', { action: input.action, error })
  }
}

/** Chiffre les secrets avant écriture dans l'audit : un journal n'est pas un coffre. */
export function redact(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(redact)
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (/password|secret|apikey|api_key|token|hash/i.test(key)) {
      out[key] = '[REDACTED]'
    } else {
      out[key] = redact(val)
    }
  }
  return out
}