import { beforeEach, describe, expect, test } from 'vitest'
import { prisma, resetDatabase } from '../helpers/db'
import { makeMember, resetFactorySequence } from '../helpers/factories'
import { parseCivilDate } from '@/lib/due-cycle'
import {
  deletePersonalLoan,
  deletePersonalRepayment,
  recordPersonalLoan,
  recordPersonalRepayment,
} from '@/lib/services/personal-dues'
import {
  getPersonalDueDetail,
  getPersonalDueSummary,
  listPersonalDebtors,
} from '@/lib/queries/personal-dues'

const JAN = parseCivilDate('2026-01-10')
const FEB = parseCivilDate('2026-02-10')
const MAR = parseCivilDate('2026-03-10')

beforeEach(async () => {
  await resetDatabase()
  resetFactorySequence()
})

/** Lend `taka` to a fresh member and hand back both the member and the loan. */
async function lend(paisa: number, name = 'ধারগ্রহীতা') {
  const member = await makeMember({ name })
  const loan = await recordPersonalLoan({
    memberCode: member.memberCode,
    amountPaisa: paisa,
    lentOn: JAN,
  })
  return { member, loan }
}

describe('recording a personal loan', () => {
  test('a loan becomes the member’s outstanding balance', async () => {
    const { member } = await lend(500_000)

    const detail = await getPersonalDueDetail(member.id)

    expect(detail?.loanPaisa).toBe(500_000)
    expect(detail?.paidPaisa).toBe(0)
    expect(detail?.remainingPaisa).toBe(500_000)
  })

  test('lending to the same person again adds to the balance', async () => {
    const { member } = await lend(500_000)

    await recordPersonalLoan({
      memberCode: member.memberCode,
      amountPaisa: 200_000,
      lentOn: FEB,
    })

    const detail = await getPersonalDueDetail(member.id)
    expect(detail?.loanPaisa).toBe(700_000)
    expect(detail?.remainingPaisa).toBe(700_000)
    expect(detail?.loans).toHaveLength(2)
  })

  test('an unknown member code is rejected', async () => {
    await expect(
      recordPersonalLoan({ memberCode: 'NHSS-99999', amountPaisa: 1000, lentOn: JAN }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('recording a repayment', () => {
  test('two installments both come off the balance', async () => {
    const { member } = await lend(500_000)

    await recordPersonalRepayment({
      memberCode: member.memberCode,
      amountPaisa: 150_000,
      paidOn: FEB,
    })
    await recordPersonalRepayment({
      memberCode: member.memberCode,
      amountPaisa: 100_000,
      paidOn: MAR,
    })

    const detail = await getPersonalDueDetail(member.id)
    expect(detail?.paidPaisa).toBe(250_000)
    expect(detail?.remainingPaisa).toBe(250_000)
    expect(detail?.repayments).toHaveLength(2)
  })

  test('paying the exact balance settles it to zero', async () => {
    const { member } = await lend(500_000)

    const result = await recordPersonalRepayment({
      memberCode: member.memberCode,
      amountPaisa: 500_000,
      paidOn: FEB,
    })

    expect(result.remainingPaisa).toBe(0)
    const detail = await getPersonalDueDetail(member.id)
    expect(detail?.remainingPaisa).toBe(0)
  })

  test('a repayment larger than the balance is refused and nothing is stored', async () => {
    const { member } = await lend(500_000)

    await expect(
      recordPersonalRepayment({
        memberCode: member.memberCode,
        amountPaisa: 500_001,
        paidOn: FEB,
      }),
    ).rejects.toMatchObject({ status: 409 })

    expect(await prisma.personalRepayment.count()).toBe(0)
  })

  test('a repayment from someone who was never lent to is refused', async () => {
    const member = await makeMember()

    await expect(
      recordPersonalRepayment({ memberCode: member.memberCode, amountPaisa: 100, paidOn: FEB }),
    ).rejects.toMatchObject({ status: 409 })
  })
})

describe('deleting a record', () => {
  test('deleting a repayment puts the amount back on the balance', async () => {
    const { member } = await lend(500_000)
    const repayment = await recordPersonalRepayment({
      memberCode: member.memberCode,
      amountPaisa: 200_000,
      paidOn: FEB,
    })

    await deletePersonalRepayment(repayment.repaymentId)

    const detail = await getPersonalDueDetail(member.id)
    expect(detail?.paidPaisa).toBe(0)
    expect(detail?.remainingPaisa).toBe(500_000)
  })

  test('deleting a loan removes it from the balance', async () => {
    const { member, loan } = await lend(500_000)

    await deletePersonalLoan(loan.loanId)

    const detail = await getPersonalDueDetail(member.id)
    expect(detail).toBeNull()
  })

  test('a loan already covered by repayments cannot be deleted', async () => {
    const { member, loan } = await lend(500_000)
    await recordPersonalRepayment({
      memberCode: member.memberCode,
      amountPaisa: 400_000,
      paidOn: FEB,
    })

    await expect(deletePersonalLoan(loan.loanId)).rejects.toMatchObject({ status: 409 })

    expect(await prisma.personalLoan.count()).toBe(1)
  })
})

describe('the summary', () => {
  test('totals reconcile and only people who still owe are counted', async () => {
    const { member: owes } = await lend(500_000, 'বাকি আছে')
    await recordPersonalRepayment({
      memberCode: owes.memberCode,
      amountPaisa: 200_000,
      paidOn: FEB,
    })

    const { member: settled } = await lend(100_000, 'শোধ করেছেন')
    await recordPersonalRepayment({
      memberCode: settled.memberCode,
      amountPaisa: 100_000,
      paidOn: FEB,
    })

    const summary = await getPersonalDueSummary()

    expect(summary.totalReceivablePaisa).toBe(600_000)
    expect(summary.totalCollectedPaisa).toBe(300_000)
    expect(summary.totalOutstandingPaisa).toBe(300_000)
    // Only the person with a balance left is a debtor; the settled one is not.
    expect(summary.debtorCount).toBe(1)
    expect(summary.memberCount).toBe(2)
  })

  test('outstanding is always receivable minus collected', async () => {
    const { member } = await lend(400_000)
    await recordPersonalRepayment({
      memberCode: member.memberCode,
      amountPaisa: 400_000,
      paidOn: FEB,
    })

    const summary = await getPersonalDueSummary()
    expect(summary.totalOutstandingPaisa).toBe(
      summary.totalReceivablePaisa - summary.totalCollectedPaisa,
    )
    expect(summary.totalOutstandingPaisa).toBe(0)
  })

  test('an empty book reports zeroes, not nulls', async () => {
    const summary = await getPersonalDueSummary()

    expect(summary).toMatchObject({
      debtorCount: 0,
      memberCount: 0,
      totalReceivablePaisa: 0,
      totalCollectedPaisa: 0,
      totalOutstandingPaisa: 0,
    })
    expect(await listPersonalDebtors()).toEqual([])
  })
})

describe('the debtor list', () => {
  test('carries each person’s identity and their three figures', async () => {
    const { member } = await lend(500_000, 'করিম')
    await recordPersonalRepayment({
      memberCode: member.memberCode,
      amountPaisa: 120_000,
      paidOn: FEB,
    })

    const [row] = await listPersonalDebtors()

    expect(row).toMatchObject({
      memberId: member.id,
      memberCode: member.memberCode,
      name: 'করিম',
      loanPaisa: 500_000,
      paidPaisa: 120_000,
      remainingPaisa: 380_000,
    })
  })

  test('people who still owe come before people who have settled', async () => {
    const { member: settled } = await lend(100_000, 'শোধ')
    await recordPersonalRepayment({
      memberCode: settled.memberCode,
      amountPaisa: 100_000,
      paidOn: FEB,
    })
    const { member: owing } = await lend(100_000, 'বাকি')

    const rows = await listPersonalDebtors()

    expect(rows.map((row) => row.name)).toEqual(['বাকি', 'শোধ'])
    expect(rows[0].memberId).toBe(owing.id)
  })

  test('a member with no personal record is not listed at all', async () => {
    await makeMember({ name: 'অসংশ্লিষ্ট' })
    const { member } = await lend(100_000, 'ধার নিয়েছেন')

    const rows = await listPersonalDebtors()

    expect(rows).toHaveLength(1)
    expect(rows[0].memberId).toBe(member.id)
  })
})

describe('the database’s own guard', () => {
  /**
   * The service and the zod schema both refuse a non-positive amount, so this
   * goes straight to SQL: a zero-taka row would be invisible on the page while
   * skewing nothing, but a negative one would silently inflate a balance. The
   * CHECK is the layer that survives a bad script or a hand-written query.
   */
  test('a zero or negative amount is rejected by the table itself', async () => {
    const member = await makeMember()

    await expect(
      prisma.$executeRaw`
        INSERT INTO personal_loans (id, member_id, amount_paisa, lent_on, updated_at)
        VALUES (gen_random_uuid(), ${member.id}::uuid, 0, '2026-01-10', now())
      `,
    ).rejects.toThrow()

    await expect(
      prisma.$executeRaw`
        INSERT INTO personal_repayments (id, member_id, amount_paisa, paid_on, updated_at)
        VALUES (gen_random_uuid(), ${member.id}::uuid, -500, '2026-01-10', now())
      `,
    ).rejects.toThrow()

    expect(await prisma.personalLoan.count()).toBe(0)
    expect(await prisma.personalRepayment.count()).toBe(0)
  })
})

describe('independence from the society’s books', () => {
  test('a personal loan writes no society row of any kind', async () => {
    await lend(500_000)

    expect(await prisma.transaction.count()).toBe(0)
    expect(await prisma.duePayment.count()).toBe(0)
    expect(await prisma.paymentSubmission.count()).toBe(0)
    expect(await prisma.historicalImport.count()).toBe(0)
  })

  test('the society dashboard reads exactly the same with and without a lending book', async () => {
    const { getDashboard } = await import('@/lib/queries/dashboard')
    const now = new Date('2026-02-15T06:00:00.000Z')

    const before = await getDashboard(now)

    const { member } = await lend(500_000)
    await recordPersonalRepayment({
      memberCode: member.memberCode,
      amountPaisa: 200_000,
      paidOn: FEB,
    })

    const after = await getDashboard(now)

    // activeMembers legitimately changes, because lend() creates a member.
    // Every money figure must not.
    expect(after.totalDueCollectedPaisa).toBe(before.totalDueCollectedPaisa)
    expect(after.totalFinesCollectedPaisa).toBe(before.totalFinesCollectedPaisa)
    expect(after.totalDelayFeesCollectedPaisa).toBe(before.totalDelayFeesCollectedPaisa)
    expect(after.totalOtherIncomePaisa).toBe(before.totalOtherIncomePaisa)
    expect(after.totalExpensePaisa).toBe(before.totalExpensePaisa)
    expect(after.balancePaisa).toBe(before.balancePaisa)
    expect(after.finesOutstandingPaisa).toBe(before.finesOutstandingPaisa)
  })
})
