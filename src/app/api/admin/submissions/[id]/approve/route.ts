import { ok, withRoute } from '@/lib/api/handler'
import { approveSubmission } from '@/lib/services/submissions'
import { approveSubmissionSchema, type ApproveSubmissionBody } from '@/lib/validation/submission'

export const POST = withRoute<ApproveSubmissionBody>(
  { auth: 'admin', schema: approveSubmissionSchema },
  async ({ body, params, admin }) =>
    ok(await approveSubmission(params.id, admin!.id, body)),
)
