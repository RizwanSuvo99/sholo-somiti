import { prisma } from '@/lib/prisma'
import { ok, withRoute } from '@/lib/api/handler'

export const GET = withRoute({ auth: 'admin' }, async ({ request }) => {
  const params = new URL(request.url).searchParams
  const year = params.get('year')
  const month = params.get('month')
  const status = params.get('status')
  const memberId = params.get('memberId')

  const rows = await prisma.duePayment.findMany({
    where: {
      ...(year ? { year: Number(year) } : {}),
      ...(month ? { month: Number(month) } : {}),
      ...(status ? { status: status as never } : {}),
      ...(memberId ? { memberId } : {}),
    },
    include: { member: { select: { memberCode: true, name: true } } },
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { member: { memberCode: 'asc' } }],
    take: 500,
  })

  return ok(rows)
})
