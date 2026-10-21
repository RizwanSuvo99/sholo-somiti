import { ok, withRoute } from '@/lib/api/handler'
import { recordPersonalRepayment } from '@/lib/services/personal-dues'
import {
  personalRepaymentSchema,
  type PersonalRepaymentBody,
} from '@/lib/validation/personal-due'

export const POST = withRoute<PersonalRepaymentBody>(
  { auth: 'admin', schema: personalRepaymentSchema },
  async ({ body }) =>
    ok(
      await recordPersonalRepayment({
        memberCode: body.memberCode,
        amountPaisa: body.amount,
        paidOn: body.paidOn,
        note: body.note,
      }),
      201,
    ),
)
