import { notFound } from '@/lib/api/errors'
import { ok, withRoute } from '@/lib/api/handler'
import { getMemberHistory } from '@/lib/services/members'

export const GET = withRoute({ auth: 'admin' }, async ({ params }) => {
  const history = await getMemberHistory(params.id)
  if (!history) throw notFound('Member', 'সদস্য')
  return ok(history)
})
