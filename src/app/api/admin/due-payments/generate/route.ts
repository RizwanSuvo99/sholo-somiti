import { ok, withRoute } from '@/lib/api/handler'
import { generateDuePayments } from '@/lib/services/dues'
import { generateDuesSchema, type GenerateDuesBody } from '@/lib/validation/due'

/**
 * Manually open a month's dues. Same code path (and same idempotency) as the
 * rollover job, so running it twice creates nothing the second time.
 */
export const POST = withRoute<GenerateDuesBody>(
  { auth: 'admin', schema: generateDuesSchema },
  async ({ body }) =>
    ok(await generateDuePayments({ dueYear: body.year, dueMonth: body.month })),
)
