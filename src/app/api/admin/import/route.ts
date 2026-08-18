import { prisma } from '@/lib/prisma'
import { ok, withRoute } from '@/lib/api/handler'

export const GET = withRoute({ auth: 'admin' }, async () =>
  ok(
    await prisma.historicalImport.findMany({
      orderBy: { createdAt: 'desc' },
      include: { performedBy: { select: { name: true } } },
      take: 100,
    }),
  ),
)
