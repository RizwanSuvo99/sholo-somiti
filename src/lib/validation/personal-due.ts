import { z } from 'zod'
import { civilDateSchema, memberCodeSchema, takaToPaisaSchema } from './common'

/**
 * The admin's private lending book.
 *
 * Two near-identical shapes rather than one with a `kind` flag, and the date
 * field is named for the direction the money moved (`lentOn` vs `paidOn`).
 * A single shared shape would make a repayment posted to the loan endpoint a
 * valid request, which is exactly the mix-up that silently doubles a balance.
 */

const noteSchema = z.string().trim().max(300, 'মন্তব্য একটু ছোট করুন').optional()

export const personalLoanSchema = z.object({
  memberCode: memberCodeSchema,
  amount: takaToPaisaSchema,
  lentOn: civilDateSchema,
  note: noteSchema,
})

export const personalRepaymentSchema = z.object({
  memberCode: memberCodeSchema,
  amount: takaToPaisaSchema,
  paidOn: civilDateSchema,
  note: noteSchema,
})

export type PersonalLoanBody = z.infer<typeof personalLoanSchema>
export type PersonalRepaymentBody = z.infer<typeof personalRepaymentSchema>
