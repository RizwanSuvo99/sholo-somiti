import { ok, withRoute } from '@/lib/api/handler'
import { deletePersonalRepayment } from '@/lib/services/personal-dues'

export const DELETE = withRoute(
  { auth: 'admin' },
  async ({ params }) => ok(await deletePersonalRepayment(params.id)),
)
