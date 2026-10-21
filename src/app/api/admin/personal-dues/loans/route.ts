import { ok, withRoute } from '@/lib/api/handler'
import { recordPersonalLoan } from '@/lib/services/personal-dues'
import { personalLoanSchema, type PersonalLoanBody } from '@/lib/validation/personal-due'

export const POST = withRoute<PersonalLoanBody>(
  { auth: 'admin', schema: personalLoanSchema },
  async ({ body }) =>
    ok(
      await recordPersonalLoan({
        memberCode: body.memberCode,
        amountPaisa: body.amount,
        lentOn: body.lentOn,
        note: body.note,
      }),
      201,
    ),
)
