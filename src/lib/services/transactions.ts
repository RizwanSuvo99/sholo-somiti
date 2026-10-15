import 'server-only'
import { prisma } from '@/lib/prisma'
import { civilToDbDate, type CivilDate } from '@/lib/due-cycle'
import { notFound } from '@/lib/api/errors'
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

/**
 * A delay fee charged to one member.
 *
 * Deliberately separate from the ৳200 fine. A fine is for missing a deadline
 * on a month the member was already liable for; a delay fee is for joining
 * after the society started, so it belongs to no month at all. Keeping them
 * apart is the whole point — merged, neither number could be read back out.
 *
 * Recorded as money already received, so it needs no charged/collected pair the
 * way the fine does. It is **not** part of the member's মোট জমা: that figure is
 * what they have saved with the society, and a penalty is not savings. The
 * exclusion is structural — `MEMBER_DEPOSIT_CATEGORIES` is an allowlist, so a
 * new category is left out by default rather than by remembering to filter it.
 *
 * Unlike the generic income form this requires a member, which is why it is its
 * own function: a delay fee nobody is attached to could never be chased or
 * explained.
 */
export async function recordDelayFee(
  input: { memberCode: string; amountPaisa: number; entryDate: CivilDate; note?: string },
  adminId: string,
) {
  const member = await prisma.member.findUnique({
    where: { memberCode: input.memberCode },
    select: { id: true, memberCode: true, name: true },
  })
  if (!member) throw notFound('Member', 'সদস্য')

  const transaction = await prisma.transaction.create({
    data: {
      type: 'INCOME',
      incomeCategory: 'DELAY_FEE',
      amountPaisa: input.amountPaisa,
      memberId: member.id,
      note: input.note?.trim() || `${member.memberCode} — বিলম্ব ফি`,
      entryDate: civilToDbDate(input.entryDate),
      createdById: adminId,
    },
  })

  return { transactionId: transaction.id, member, amountPaisa: input.amountPaisa }
}
