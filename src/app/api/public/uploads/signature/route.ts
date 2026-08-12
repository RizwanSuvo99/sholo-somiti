import { ok, withRoute } from '@/lib/api/handler'
import { signUpload, uploadEndpoint } from '@/lib/cloudinary'

/**
 * Unauthenticated, because members upload their payment screenshot before any
 * account exists. Rate limited so it cannot be used as free image hosting.
 */
export const POST = withRoute(
  { auth: 'public', rateLimit: { limit: 5, windowMs: 60 * 1000 } },
  async () => {
    const signature = signUpload('sholo/submissions')
    return ok({ ...signature, endpoint: uploadEndpoint(signature.cloudName) })
  },
)
