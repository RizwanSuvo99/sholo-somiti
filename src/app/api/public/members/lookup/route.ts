import { ok, withRoute } from '@/lib/api/handler'
import { lookupMember } from '@/lib/services/submissions'
import { normalizeMemberCode } from '@/lib/member-code'

/**
 * Public, and called each time a member picks their ID from the form's dropdown.
 *
 * The limit is generous because names and codes are already published on the
 * member directory, so this is no longer an enumeration oracle — it is only a
 * guard against someone hammering the endpoint.
 */
export const GET = withRoute(
  { auth: 'public', rateLimit: { limit: 60, windowMs: 60 * 1000 } },
  async ({ request }) => {
    const code = new URL(request.url).searchParams.get('code') ?? ''
    if (!code.trim()) return ok({ found: false }, 200)

    const result = await lookupMember(normalizeMemberCode(code))

    // A uniform response for "no such member" and "inactive member", so the
    // endpoint does not distinguish between them.
    return ok(result ?? { found: false }, 200)
  },
)
