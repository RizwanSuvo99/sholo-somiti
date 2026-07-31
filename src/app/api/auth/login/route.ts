import { prisma } from '@/lib/prisma'
import { AppError } from '@/lib/api/errors'
import { ok, withRoute } from '@/lib/api/handler'
import { createSessionCookie } from '@/lib/auth/session'
import { verifyPassword } from '@/lib/auth/password'
import { loginSchema, type LoginInput } from '@/lib/validation/auth'

const invalidCredentials = () =>
  new AppError(
    'UNAUTHORIZED',
    401,
    'Invalid email or password',
    'ইমেইল বা পাসওয়ার্ড সঠিক নয়',
  )

export const POST = withRoute<LoginInput>(
  {
    auth: 'public',
    schema: loginSchema,
    // Slow down credential stuffing without locking a real admin out for long.
    rateLimit: { limit: 5, windowMs: 15 * 60 * 1000 },
  },
  async ({ body }) => {
    const admin = await prisma.admin.findUnique({ where: { email: body.email } })

    // Hash-compare even when the account is missing, so response time does not
    // reveal which emails exist.
    const hash = admin?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin'
    const matches = await verifyPassword(body.password, hash)

    if (!admin || !admin.isActive || !matches) throw invalidCredentials()

    await prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    })

    await createSessionCookie({
      sub: admin.id,
      email: admin.email,
      name: admin.name,
      tv: admin.tokenVersion,
    })

    return ok({ id: admin.id, name: admin.name, email: admin.email })
  },
)
