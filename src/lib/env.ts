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

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
  throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`)
}

export const env = parsed.data
export const isProduction = env.NODE_ENV === 'production'
