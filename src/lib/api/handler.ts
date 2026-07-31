import { NextResponse } from 'next/server'
import { ZodError, type ZodType } from 'zod'
import {
  AppError,
  duplicateSubmission,
  isActiveSubmissionConflict,
  rateLimited,
  unauthorized,
  validationFailed,
} from './errors'
import { clientKey, rateLimit } from './rate-limit'
import { requireAdmin, type AdminPrincipal } from '@/lib/auth/require-admin'

export type RouteAuth = 'public' | 'admin' | 'cron'

export type RouteContext<TBody> = {
  request: Request
  body: TBody
  admin: AdminPrincipal | null
  params: Record<string, string>
}

export type RouteOptions<TBody> = {
  auth: RouteAuth
  schema?: ZodType<TBody>
  rateLimit?: { limit: number; windowMs: number; key?: string }
}

function errorResponse(error: AppError) {
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        messageBn: error.messageBn,
        ...(error.details ? { details: error.details } : {}),
      },
    },
    { status: error.status },
  )
}

/**
 * Reject cross-site writes. SameSite=Lax already blocks the common CSRF shapes;
 * this is the second layer, and it is cheap.
 */
function originAllowed(request: Request): boolean {
  if (request.method === 'GET' || request.method === 'HEAD') return true

  const origin = request.headers.get('origin')
  if (!origin) return true // non-browser clients (curl, the cron job) send none

  const host = request.headers.get('host')
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const header = request.headers.get('authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : ''

  // Constant-time compare: a length-leaking early return would let an attacker
  // discover the secret one character at a time.
  if (provided.length !== secret.length) return false
  let diff = 0
  for (let i = 0; i < secret.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ secret.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Wraps a route handler with auth, validation, rate limiting and error mapping,
 * so every endpoint returns the same error shape and no handler has to remember
 * to check a session.
 */
export function withRoute<TBody = unknown>(
  options: RouteOptions<TBody>,
  handler: (context: RouteContext<TBody>) => Promise<Response>,
) {
  return async (
    request: Request,
    routeArgs?: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    try {
      if (!originAllowed(request)) {
        throw new AppError('FORBIDDEN', 403, 'Cross-origin request rejected', 'অনুরোধ গ্রহণযোগ্য নয়')
      }

      if (options.rateLimit) {
        const key = `${options.rateLimit.key ?? new URL(request.url).pathname}:${clientKey(request)}`
        const result = rateLimit(key, options.rateLimit.limit, options.rateLimit.windowMs)
        if (!result.ok) throw rateLimited()
      }

      let admin: AdminPrincipal | null = null
      if (options.auth === 'admin') {
        admin = await requireAdmin()
      } else if (options.auth === 'cron') {
        // A logged-in admin may also trigger the job from the dashboard.
        if (!cronAuthorized(request)) {
          admin = await requireAdmin().catch(() => null)
          if (!admin) throw unauthorized()
        }
      }

      let body = undefined as TBody
      if (options.schema) {
        const raw = await request.json().catch(() => {
          throw validationFailed({ body: 'expected JSON' })
        })
        body = options.schema.parse(raw)
      }

      const params = routeArgs?.params ? await routeArgs.params : {}
      return await handler({ request, body, admin, params })
    } catch (error) {
      if (error instanceof AppError) return errorResponse(error)

      if (error instanceof ZodError) {
        return errorResponse(
          validationFailed(
            error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          ),
        )
      }

      if (isActiveSubmissionConflict(error)) return errorResponse(duplicateSubmission())

      console.error('[api] unhandled error', error)
      return errorResponse(
        new AppError('INTERNAL', 500, 'Something went wrong', 'কিছু একটা ভুল হয়েছে'),
      )
    }
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}
