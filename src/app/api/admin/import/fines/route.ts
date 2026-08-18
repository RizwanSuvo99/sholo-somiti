import { ok, withRoute } from '@/lib/api/handler'
import { importMemberFine } from '@/lib/services/import'
import { fineImportSchema, type FineImportBody } from '@/lib/validation/import'

export const POST = withRoute<FineImportBody>(
  { auth: 'admin', schema: fineImportSchema },
  async ({ body, admin }) =>
    ok(
      await importMemberFine(
        {
          memberCode: body.memberCode,
          month: body.month,
          year: body.year,
          amountPaisa: body.amount,
          note: body.note,
        },
        admin!.id,
      ),
      201,
    ),
)
