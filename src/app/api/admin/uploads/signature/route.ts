import { ok, withRoute } from '@/lib/api/handler'
import { signUpload, uploadEndpoint } from '@/lib/cloudinary'

export const POST = withRoute({ auth: 'admin' }, async () => {
  const signature = signUpload('sholo/members')
  return ok({ ...signature, endpoint: uploadEndpoint(signature.cloudName) })
})
