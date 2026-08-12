import { prisma } from '@/lib/prisma'
import { ok, withRoute } from '@/lib/api/handler'

export const GET = withRoute({ auth: 'admin' }, async ({ request }) => {
  const status = new URL(request.url).searchParams.get('status') ?? 'PENDING'

  const items = await prisma.paymentSubmission.findMany({
    where: status === 'ALL' ? {} : { status: status as never },
    include: { member: { select: { memberCode: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return ok(items)
})
