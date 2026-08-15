import 'server-only'
import { prisma } from '@/lib/prisma'
import { civilToDbDate } from '@/lib/due-cycle'
import type { CreateTransactionBody } from '@/lib/validation/transaction'

/**
 * Manual ledger entries.
 *
 * This is also the correct route for a duplicate or mistaken member payment:
 * the one-submission-per-month rule constrains the member-facing form only, not
 * the admin, precisely so corrections remain possible.
 */
export async function createTransaction(input: CreateTransactionBody, adminId: string) {
  if (input.type === 'INCOME') {
    return prisma.transaction.create({
      data: {
        type: 'INCOME',
        incomeCategory: input.incomeCategory,
        amountPaisa: input.amount,
        memberId: input.memberId ?? null,
        note: input.note,
        entryDate: civilToDbDate(input.entryDate),
        createdById: adminId,
      },
    })
  }

  return prisma.transaction.create({
    data: {
      type: 'EXPENSE',
      expenseCategoryId: input.expenseCategoryId ?? null,
      expenseCategoryText: input.expenseCategoryId ? null : (input.expenseCategoryText ?? null),
      amountPaisa: input.amount,
      note: input.note,
      entryDate: civilToDbDate(input.entryDate),
      createdById: adminId,
    },
  })
}

/**
 * Corrections void rather than delete: the row stays in the ledger with a
 * reason, and every dashboard aggregate filters on `voidedAt: null`.
 */
export async function voidTransaction(id: string, reason: string) {
  return prisma.transaction.update({
    where: { id },
    data: { voidedAt: new Date(), voidReason: reason },
  })
}
