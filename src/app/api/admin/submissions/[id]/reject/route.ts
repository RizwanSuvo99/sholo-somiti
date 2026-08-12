import { ok, withRoute } from '@/lib/api/handler'
import { rejectSubmission } from '@/lib/services/submissions'
import { rejectSubmissionSchema, type RejectSubmissionBody } from '@/lib/validation/submission'

export const POST = withRoute<RejectSubmissionBody>(
  { auth: 'admin', schema: rejectSubmissionSchema },
  async ({ body, params, admin }) =>
    ok(await rejectSubmission(params.id, admin!.id, body.reason)),
)
