import { AppError } from '@/lib/api/errors'
import { ok, withRoute } from '@/lib/api/handler'
import { planMemberDueBackfill } from '@/lib/services/import'

/**
 * What the backfill would write, so the admin sees every month and the total
 * before committing. Read-only: it creates nothing.
 */
export const GET = withRoute({ auth: 'admin' }, async ({ request }) => {
  const query = new URL(request.url).searchParams

  const number = (key: string) => {
    const value = Number(query.get(key))
    if (!Number.isInteger(value)) {
      throw new AppError('VALIDATION_FAILED', 422, `Bad ${key}`, 'মাস বা বছর ঠিক নেই')
    }
    return value
  }

  return ok(
    await planMemberDueBackfill({
      memberCode: query.get('memberCode') ?? '',
      from: { dueYear: number('fromYear'), dueMonth: number('fromMonth') },
      to: { dueYear: number('toYear'), dueMonth: number('toMonth') },
    }),
  )
})
