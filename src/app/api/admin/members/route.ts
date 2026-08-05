import { prisma } from '@/lib/prisma'
import { ok, withRoute } from '@/lib/api/handler'
import { createMember } from '@/lib/services/members'
import { createMemberSchema, type CreateMemberBody } from '@/lib/validation/member'

export const GET = withRoute({ auth: 'admin' }, async ({ request }) => {
  const url = new URL(request.url)
  const query = url.searchParams.get('q')?.trim() ?? ''
  const activeParam = url.searchParams.get('isActive')
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 25)))

  const where = {
    ...(activeParam === null ? {} : { isActive: activeParam === 'true' }),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' as const } },
            { memberCode: { contains: query, mode: 'insensitive' as const } },
            { mobile: { contains: query } },
          ],
        }
      : {}),
  }

  const [items, total] = await Promise.all([
    prisma.member.findMany({
      where,
      orderBy: { memberCode: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.member.count({ where }),
  ])

  return ok({ items, total, page, pageSize })
})

export const POST = withRoute<CreateMemberBody>(
  { auth: 'admin', schema: createMemberSchema },
  async ({ body }) => ok(await createMember(body), 201),
)
