import 'server-only'
import { prisma } from '@/lib/prisma'
import { civilToDbDate, type CivilDate } from '@/lib/due-cycle'
import { conflict, notFound } from '@/lib/api/errors'
import { formatBDT } from '@/lib/money'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * The admin's private lending book: money they lent out of their own pocket.
 *
 * Nothing in this module writes to `transactions`, `due_payments` or any other
 * society table, and no society figure reads `personal_loans` or
 * `personal_repayments`. That separation is the feature — a mistake here cannot
 * move the society's balance, and a society correction cannot disturb this.
 *
 * The one rule worth enforcing is that a repayment never exceeds what is still
 * owed. It is almost always a typo, and allowing it would break the identity
 * the whole page rests on:
 *
 *     outstanding = lent − repaid
 *
 * With overpayment allowed, one person's negative balance would quietly cancel
 * another person's real debt and the headline total would understate what is
 * actually out there. Refusing it keeps that identity exact, which is why
 * `getPersonalDueSummary` can subtract instead of summing per member.
 */

export type PersonalBalance = {
  loanPaisa: number
  paidPaisa: number
  remainingPaisa: number
}

async function balanceOf(memberId: string, client: Tx): Promise<PersonalBalance> {
  const lent = await client.personalLoan.aggregate({
    where: { memberId },
    _sum: { amountPaisa: true },
  })
  const repaid = await client.personalRepayment.aggregate({
    where: { memberId },
    _sum: { amountPaisa: true },
  })

  const loanPaisa = lent._sum.amountPaisa ?? 0
  const paidPaisa = repaid._sum.amountPaisa ?? 0
  return { loanPaisa, paidPaisa, remainingPaisa: loanPaisa - paidPaisa }
}

async function memberByCode(memberCode: string, client: Tx | typeof prisma = prisma) {
  const member = await client.member.findUnique({
    where: { memberCode },
    select: { id: true, memberCode: true, name: true },
  })
  if (!member) throw notFound('Member', 'সদস্য')
  return member
}

export type PersonalLoanInput = {
  memberCode: string
  amountPaisa: number
  lentOn: CivilDate
  note?: string | null
}

export async function recordPersonalLoan(input: PersonalLoanInput) {
  const member = await memberByCode(input.memberCode)

  const loan = await prisma.personalLoan.create({
    data: {
      memberId: member.id,
      amountPaisa: input.amountPaisa,
      lentOn: civilToDbDate(input.lentOn),
      note: input.note?.trim() || null,
    },
  })

  return { loanId: loan.id, member, amountPaisa: loan.amountPaisa }
}

export type PersonalRepaymentInput = {
  memberCode: string
  amountPaisa: number
  paidOn: CivilDate
  note?: string | null
}

/**
 * Take one installment back.
 *
 * Serializable, because the balance is read and then written against: at a
 * weaker level two installments submitted at once could each see the full
 * balance and both be accepted, together exceeding it.
 */
export async function recordPersonalRepayment(input: PersonalRepaymentInput) {
  return prisma.$transaction(
    async (tx) => {
      const member = await memberByCode(input.memberCode, tx)
      const balance = await balanceOf(member.id, tx)

      if (balance.loanPaisa === 0) {
        throw conflict(
          'CONFLICT',
          'This member has no personal loan on record',
          `${member.memberCode} — এই সদস্যকে কোনো টাকা ধার দেওয়া হয়নি, তাই ফেরত নেওয়ার কিছু নেই`,
        )
      }

      if (input.amountPaisa > balance.remainingPaisa) {
        throw conflict(
          'CONFLICT',
          'Repayment exceeds the outstanding balance',
          `ফেরতের পরিমাণ বাকির চেয়ে বেশি — এখন বাকি আছে ${formatBDT(balance.remainingPaisa)}`,
        )
      }

      const repayment = await tx.personalRepayment.create({
        data: {
          memberId: member.id,
          amountPaisa: input.amountPaisa,
          paidOn: civilToDbDate(input.paidOn),
          note: input.note?.trim() || null,
        },
      })

      return {
        repaymentId: repayment.id,
        member,
        amountPaisa: repayment.amountPaisa,
        remainingPaisa: balance.remainingPaisa - repayment.amountPaisa,
      }
    },
    { isolationLevel: 'Serializable' },
  )
}

/**
 * Remove a loan entry.
 *
 * Refused when the repayments already recorded would no longer fit under what
 * is left — otherwise the member would show money repaid against a debt that
 * no longer exists, and `outstanding = lent − repaid` would go negative. The
 * message says what to do instead, because the admin's real intent in that
 * situation is nearly always to fix the amount, not to erase the history.
 *
 * These are hard deletes, unlike the society ledger's soft void. A void exists
 * there so members can be shown why a figure changed; this book has one reader,
 * and a wrong line in it is simply a wrong line.
 */
export async function deletePersonalLoan(id: string) {
  return prisma.$transaction(
    async (tx) => {
      const loan = await tx.personalLoan.findUnique({
        where: { id },
        select: { id: true, memberId: true, amountPaisa: true },
      })
      if (!loan) throw notFound('Loan', 'ধারের তথ্য')

      const balance = await balanceOf(loan.memberId, tx)

      if (balance.loanPaisa - loan.amountPaisa < balance.paidPaisa) {
        throw conflict(
          'CONFLICT',
          'Deleting this loan would leave repayments without a debt',
          `এই ধারের বিপরীতে ইতিমধ্যে ${formatBDT(balance.paidPaisa)} ফেরত নেওয়া হয়েছে — আগে কিস্তিগুলো মুছুন, তারপর ধারের তথ্য মুছুন`,
        )
      }

      await tx.personalLoan.delete({ where: { id } })
      return { loanId: id, memberId: loan.memberId }
    },
    { isolationLevel: 'Serializable' },
  )
}

export async function deletePersonalRepayment(id: string) {
  const repayment = await prisma.personalRepayment.findUnique({
    where: { id },
    select: { id: true, memberId: true },
  })
  if (!repayment) throw notFound('Repayment', 'কিস্তির তথ্য')

  await prisma.personalRepayment.delete({ where: { id } })
  return { repaymentId: id, memberId: repayment.memberId }
}
