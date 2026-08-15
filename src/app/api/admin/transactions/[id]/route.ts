import { ok, withRoute } from '@/lib/api/handler'
import { voidTransaction } from '@/lib/services/transactions'
import { voidTransactionSchema, type VoidTransactionBody } from '@/lib/validation/transaction'

/** A void, not a delete — the ledger keeps the row and the reason. */
export const DELETE = withRoute<VoidTransactionBody>(
  { auth: 'admin', schema: voidTransactionSchema },
  async ({ body, params }) => ok(await voidTransaction(params.id, body.reason)),
)
