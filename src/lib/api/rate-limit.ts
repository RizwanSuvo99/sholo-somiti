/**
 * In-memory fixed-window rate limiting.
 *
 * Adequate for a single self-hosted Node process, which is how this app is
 * deployed. It deliberately does not pretend to be distributed: if the app is
 * ever run behind multiple instances, this needs to move to Redis, and the
 * public endpoints it protects are the ones that matter (member lookup, the
 * unauthenticated submission endpoint, upload signing, and login).
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/** Evict expired buckets occasionally so the map cannot grow without bound. */
function sweep(now: number) {
  if (buckets.size < 5_000) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export type RateLimitResult = {
  ok: boolean
  remaining: number
  resetAt: number
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + windowMs }
    buckets.set(key, bucket)
    return { ok: true, remaining: limit - 1, resetAt: bucket.resetAt }
  }

  existing.count += 1
  return {
    ok: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  }
}

/** Test helper — the limiter is process-global state. */
export function resetRateLimits(): void {
  buckets.clear()
}

/**
 * Best-effort client address. Behind a reverse proxy this is the
 * `X-Forwarded-For` head; direct connections fall back to a constant, which
 * degrades the limit to global rather than failing open per-request.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
