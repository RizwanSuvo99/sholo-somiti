import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/auth/session'

/**
 * A fast gate in front of the admin area (Next 16 renamed this convention
 * from `middleware` to `proxy`).
 *
 * This verifies the cookie's signature and expiry only — it does not hit the
 * database, because this runs on the Edge runtime. It is a redirect
 * convenience, NOT the security boundary: `requireAdmin()` re-verifies against
 * the database inside every admin handler and the admin layout.
 */
export default async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const claims = token ? await verifySession(token) : null
  if (claims) return NextResponse.next()

  const { pathname, search } = request.nextUrl

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required', messageBn: 'প্রবেশ করুন' } },
      { status: 401 },
    )
  }

  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('next', `${pathname}${search}`)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
