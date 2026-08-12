import { ok, withRoute } from '@/lib/api/handler'
import { clientKey } from '@/lib/api/rate-limit'
import { createSubmission } from '@/lib/services/submissions'
import { createSubmissionSchema, type CreateSubmissionBody } from '@/lib/validation/submission'

export const POST = withRoute<CreateSubmissionBody>(
  {
    auth: 'public',
    schema: createSubmissionSchema,
    rateLimit: { limit: 10, windowMs: 60 * 60 * 1000 },
  },
  async ({ body, request }) => {
    const submission = await createSubmission({
      memberCode: body.memberCode,
      name: body.name,
      sendingDate: body.sendingDate,
      amountPaisa: body.amount,
      transactionRef: body.transactionRef,
      paymentMedium: body.paymentMedium,
      bankName: body.bankName,
      mobileBankingProvider: body.mobileBankingProvider,
      mobileBankingNumber: body.mobileBankingNumber,
      screenshotUrl: body.screenshotUrl,
      screenshotPublicId: body.screenshotPublicId,
      dueMonth: body.dueMonth,
      dueYear: body.dueYear,
      ipAddress: clientKey(request),
    })

    return ok(submission, 201)
  },
)
