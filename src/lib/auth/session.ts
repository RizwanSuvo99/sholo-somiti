import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

/**
 * Admin sessions are stateless HS256 JWTs in an httpOnly cookie.
 *
 * `jose` specifically, not `jsonwebtoken`: Next middleware runs on the Edge
 * runtime where Node's `crypto` is unavailable. `jose` uses WebCrypto and works
 * in both runtimes, so the same verify function serves middleware and handlers.
 */

export const SESSION_COOKIE = 'admin_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

export type SessionClaims = {
  sub: string
  email: string
  name: string
  /** Mirrors Admin.tokenVersion; a bump invalidates every issued token. */
  tv: number
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters.')
  }
  return new TextEncoder().encode(secret)
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ email: claims.email, name: claims.name, tv: claims.tv })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey())
}

/** Verify signature and expiry. Does not touch the database — Edge-safe. */
export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] })
    if (typeof payload.sub !== 'string') return null
    return {
      sub: payload.sub,
      email: String(payload.email ?? ''),
      name: String(payload.name ?? ''),
      tv: Number(payload.tv ?? 0),
    }
  } catch {
    return null
  }
}

export async function createSessionCookie(claims: SessionClaims): Promise<void> {
  const token = await signSession(claims)
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function destroySessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export async function readSessionCookie(): Promise<SessionClaims | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  return token ? verifySession(token) : null
}
