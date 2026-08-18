import { ok, withRoute } from '@/lib/api/handler'
import { importUniformDue } from '@/lib/services/import'
import { uniformImportSchema, type UniformImportBody } from '@/lib/validation/import'

export const POST = withRoute<UniformImportBody>(
  { auth: 'admin', schema: uniformImportSchema },
  async ({ body, admin }) =>
    ok(
      await importUniformDue(
        { month: body.month, year: body.year, amountPaisa: body.amount, note: body.note },
        admin!.id,
      ),
      201,
    ),
)
