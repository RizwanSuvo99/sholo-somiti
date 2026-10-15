import { ok, withRoute } from '@/lib/api/handler'
import { importMemberDueBackfill } from '@/lib/services/import'
import { memberBackfillSchema, type MemberBackfillBody } from '@/lib/validation/import'

export const POST = withRoute<MemberBackfillBody>(
  { auth: 'admin', schema: memberBackfillSchema },
  async ({ body, admin }) =>
    ok(
      await importMemberDueBackfill(
        {
          memberCode: body.memberCode,
          from: { dueYear: body.fromYear, dueMonth: body.fromMonth },
          to: { dueYear: body.toYear, dueMonth: body.toMonth },
          alignJoinedOn: body.alignJoinedOn,
          note: body.note,
        },
        admin!.id,
      ),
      201,
    ),
)
