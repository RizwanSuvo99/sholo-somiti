import { prisma } from '@/lib/prisma'
import { ok, withRoute } from '@/lib/api/handler'
import { createTransaction } from '@/lib/services/transactions'
import { createTransactionSchema, type CreateTransactionBody } from '@/lib/validation/transaction'

export const GET = withRoute({ auth: 'admin' }, async ({ request }) => {
  const params = new URL(request.url).searchParams
  const type = params.get('type')
  const category = params.get('category')
  const memberId = params.get('memberId')
  const from = params.get('from')
  const to = params.get('to')

  const items = await prisma.transaction.findMany({
    where: {
      ...(type ? { type: type as never } : {}),
      ...(category ? { incomeCategory: category as never } : {}),
      ...(memberId ? { memberId } : {}),
      ...(from || to
        ? {
            entryDate: {
              ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
              ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}),
            },
          }
        : {}),
    },
    include: {
      member: { select: { memberCode: true, name: true } },
      expenseCategory: { select: { name: true } },
    },
    orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    take: 300,
  })

  return ok(items)
})

export const POST = withRoute<CreateTransactionBody>(
  { auth: 'admin', schema: createTransactionSchema },
  async ({ body, admin }) => ok(await createTransaction(body, admin!.id), 201),
)
