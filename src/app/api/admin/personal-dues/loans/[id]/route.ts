import { ok, withRoute } from '@/lib/api/handler'
import { deletePersonalLoan } from '@/lib/services/personal-dues'

/**
 * A real delete, not the society ledger's soft void: this book has one reader,
 * so a wrong line is simply wrong. The service still refuses a delete that
 * would leave repayments standing against a debt that no longer exists.
 */
export const DELETE = withRoute(
  { auth: 'admin' },
  async ({ params }) => ok(await deletePersonalLoan(params.id)),
)
