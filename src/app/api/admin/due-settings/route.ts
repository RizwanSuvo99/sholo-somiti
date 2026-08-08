import { prisma } from '@/lib/prisma'
import { ok, withRoute } from '@/lib/api/handler'
import { upsertDueSetting } from '@/lib/services/dues'
import { dueSettingSchema, type DueSettingBody } from '@/lib/validation/due'

export const GET = withRoute({ auth: 'admin' }, async () =>
  ok(
    await prisma.monthlyDueSetting.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    }),
  ),
)

export const POST = withRoute<DueSettingBody>(
  { auth: 'admin', schema: dueSettingSchema },
  async ({ body }) =>
    ok(
      await upsertDueSetting(
        { dueYear: body.year, dueMonth: body.month },
        body.amount,
        body.note,
      ),
    ),
)
