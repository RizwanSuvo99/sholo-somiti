import { ok, withRoute } from '@/lib/api/handler'
import { destroySessionCookie } from '@/lib/auth/session'

export const POST = withRoute({ auth: 'public' }, async () => {
  await destroySessionCookie()
  return ok({ ok: true })
})
