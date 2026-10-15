import { ok, withRoute } from '@/lib/api/handler'
import { recordDelayFee } from '@/lib/services/transactions'
import { delayFeeSchema, type DelayFeeBody } from '@/lib/validation/transaction'

export const POST = withRoute<DelayFeeBody>(
  { auth: 'admin', schema: delayFeeSchema },
  async ({ body, admin }) =>
    ok(
      await recordDelayFee(
        {
          memberCode: body.memberCode,
          amountPaisa: body.amount,
          entryDate: body.entryDate,
          note: body.note,
        },
        admin!.id,
      ),
      201,
    ),
)
