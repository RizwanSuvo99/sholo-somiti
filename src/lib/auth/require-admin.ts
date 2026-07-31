import { prisma } from '@/lib/prisma'
import { unauthorized } from '@/lib/api/errors'
import { readSessionCookie } from './session'

export type AdminPrincipal = {
  id: string
  email: string
  name: string
}

/**
 * The actual security boundary.
 *
 * Middleware checks the cookie's signature for a fast redirect, but middleware
 * has been bypassable before (CVE-2025-29927), so it is treated as a UX
 * optimisation only. Every admin route handler and the admin layout call this,
 * which re-reads the admin from the database and re-checks that the account is
 * still active and the token has not been revoked.
 */
export async function requireAdmin(): Promise<AdminPrincipal> {
  const claims = await readSessionCookie()
  if (!claims) throw unauthorized()

  const admin = await prisma.admin.findUnique({
    where: { id: claims.sub },
    select: { id: true, email: true, name: true, isActive: true, tokenVersion: true },
  })

  if (!admin || !admin.isActive) throw unauthorized()
  if (admin.tokenVersion !== claims.tv) throw unauthorized()

  return { id: admin.id, email: admin.email, name: admin.name }
}

/** Same check, but returns null instead of throwing. For layouts that redirect. */
export async function getAdmin(): Promise<AdminPrincipal | null> {
  return requireAdmin().catch(() => null)
}
