import 'server-only'
import { z } from 'zod'

/**
 * Server-side environment, parsed once at import.
 *
 * Importing 'server-only' makes a leak into a Client Component a build error
 * rather than a shipped secret — CLOUDINARY_API_SECRET and SESSION_SECRET must
 * never reach the browser.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_DATABASE_URL: z.string().optional(),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),

  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),

  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters'),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

type Env = z.infer<typeof schema>

let cached: Env | null = null

/**
 * Validates on first use rather than on import.
 *
 * The production image is built without any secrets — nothing is baked into the
 * bundle, so the same image runs anywhere. Validating at import time would make
 * the build itself demand a Cloudinary key, because Next loads every route
 * module while collecting page data.
 *
 * Deferring it keeps the failure just as loud: the first request that needs a
 * secret still throws, with every missing key named.
 */
function load(): Env {
  if (cached) return cached

  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`,
    )
  }

  cached = parsed.data
  return cached
}

export const env = new Proxy({} as Env, {
  get: (_target, key: string) => load()[key as keyof Env],
})

/** Safe to read without validation — it never carries a secret. */
export const isProduction = process.env.NODE_ENV === 'production'
