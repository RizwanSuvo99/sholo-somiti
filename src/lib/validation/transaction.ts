import { z } from 'zod'
import { civilDateSchema, memberCodeSchema, requiredNote, takaToPaisaSchema, uuidSchema } from './common'

export const createIncomeSchema = z.object({
  type: z.literal('INCOME'),
  incomeCategory: z.enum(['MONTHLY_DUE', 'FINE', 'OTHER_INCOME']),
  amount: takaToPaisaSchema,
  memberId: uuidSchema.optional().nullable(),
  note: requiredNote,
  entryDate: civilDateSchema,
})

export const createExpenseSchema = z
  .object({
    type: z.literal('EXPENSE'),
    expenseCategoryId: uuidSchema.optional().nullable(),
    expenseCategoryText: z.string().trim().max(120).optional().nullable(),
    amount: takaToPaisaSchema,
    note: requiredNote,
    entryDate: civilDateSchema,
  })
  .refine((value) => Boolean(value.expenseCategoryId || value.expenseCategoryText), {
    message: 'ব্যয়ের খাত বেছে নিন বা লিখুন',
    path: ['expenseCategoryId'],
  })

export const createTransactionSchema = z.discriminatedUnion('type', [
  createIncomeSchema,
  createExpenseSchema,
])

/**
 * A delay fee is entered through its own endpoint rather than the generic
 * income form, so `memberId` can be required. `DELAY_FEE` is deliberately
 * absent from `createIncomeSchema` above: two routes to the same category would
 * mean delay fees that belong to nobody.
 */
export const delayFeeSchema = z.object({
  memberCode: memberCodeSchema,
  amount: takaToPaisaSchema,
  entryDate: civilDateSchema,
  note: z.string().trim().max(300).optional(),
})

export const voidTransactionSchema = z.object({
  reason: z.string().trim().min(3, 'কারণ লিখুন').max(300),
})

export type CreateTransactionBody = z.infer<typeof createTransactionSchema>
export type DelayFeeBody = z.infer<typeof delayFeeSchema>
export type VoidTransactionBody = z.infer<typeof voidTransactionSchema>
