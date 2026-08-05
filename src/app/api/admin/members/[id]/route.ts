import { prisma } from '@/lib/prisma'
import { notFound } from '@/lib/api/errors'
import { ok, withRoute } from '@/lib/api/handler'
import { updateMember } from '@/lib/services/members'
import { updateMemberSchema, type UpdateMemberBody } from '@/lib/validation/member'

export const GET = withRoute({ auth: 'admin' }, async ({ params }) => {
  const member = await prisma.member.findUnique({ where: { id: params.id } })
  if (!member) throw notFound('Member', 'সদস্য')
  return ok(member)
})

export const PATCH = withRoute<UpdateMemberBody>(
  { auth: 'admin', schema: updateMemberSchema },
  async ({ body, params }) => ok(await updateMember(params.id, body)),
)
