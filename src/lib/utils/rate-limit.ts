/**
 * Limitation de débit en mémoire, appliquée aux routes d'authentification.
 *
 * nginx applique déjà une limite au niveau du reverse proxy ; cette couche
 * protège aussi le développement local et les appels directs au serveur Node
 * qui contournent le proxy. En cas de plusieurs instances, basculer sur un
 * stockage partagé (Redis) — non requis pour le MVP mono-serveur.
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// Purge périodique pour éviter une croissance illimitée de la Map.
const SWEEP_INTERVAL_MS = 60_000
const sweeper = setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}, SWEEP_INTERVAL_MS)

// Ne pas maintenir le process en vie uniquement pour ce timer.
if (typeof sweeper.unref === 'function') sweeper.unref()

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 }
  }

  bucket.count += 1

  if (bucket.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }

  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 }
}

export function clientIdentifier(request: Request, scope: string): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'local'
  const emailHeader = request.headers.get('x-rate-limit-key')
  return `${scope}:${emailHeader || ip}`
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Remaining': String(result.remaining),
    ...(result.allowed ? {} : { 'Retry-After': String(result.retryAfterSeconds) }),
  }
}