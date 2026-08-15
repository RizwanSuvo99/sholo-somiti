import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, withRoute } from '@/lib/api/handler'

const schema = z.object({ name: z.string().trim().min(1, 'খাতের নাম দিন').max(120) })

export const GET = withRoute({ auth: 'admin' }, async () =>
  ok(await prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })),
)

export const POST = withRoute<z.infer<typeof schema>>(
  { auth: 'admin', schema },
  async ({ body }) =>
    ok(
      await prisma.expenseCategory.upsert({
        where: { name: body.name },
        update: { isActive: true },
        create: { name: body.name },
      }),
      201,
    ),
)
