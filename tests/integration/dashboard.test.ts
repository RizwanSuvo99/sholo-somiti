import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, resetDatabase } from '../helpers/db'
import { makeAdmin, makeDueSetting, makeMember, makeSubmission, resetFactorySequence } from '../helpers/factories'
import { approveSubmission } from '@/lib/services/submissions'
import { getDashboard } from '@/lib/queries/dashboard'
import { createTransaction } from '@/lib/services/transactions'
import { generateDuePayments } from '@/lib/services/dues'
import { runMonthRollover } from '@/lib/services/rollover'
import { FINE_PAISA } from '@/lib/fines'
import { dhakaCivilToInstant, parseCivilDate, type DueMonth } from '@/lib/due-cycle'

const APRIL: DueMonth = { dueYear: 2026, dueMonth: 4 }
const DUE_PAISA = 50_000
const afterAprilDeadline = dhakaCivilToInstant(parseCivilDate('2026-04-21'), 0, 5)

/** An independently written aggregate, to cross-check the dashboard query. */
async function ledgerTotals() {
  const rows = await prisma.$queryRaw<
    { type: string; income_category: string | null; total: bigint }[]
  >`
    SELECT "type", "income_category", SUM("amount_paisa")::bigint AS total
    FROM transactions
    WHERE "voided_at" IS NULL
    GROUP BY "type", "income_category"
  `

  const of = (type: string, category: string | null) =>
    Number(rows.find((r) => r.type === type && r.income_category === category)?.total ?? 0)

  return {
    due: of('INCOME', 'MONTHLY_DUE'),
    fine: of('INCOME', 'FINE'),
    other: of('INCOME', 'OTHER_INCOME'),
    expense: of('EXPENSE', null),
  }
}

describe('dashboard aggregates', () => {
  beforeEach(async () => {
    await resetDatabase()
    resetFactorySequence()
    await makeDueSetting(APRIL, DUE_PAISA)
  })

  it('reconciles every tile against an independent SQL aggregate', async () => {
    const admin = await makeAdmin()
    const a = await makeMember()
    const b = await makeMember()

    const first = await makeSubmission(a.id, a.memberCode, APRIL, { sendingDate: '2026-04-10' })
    await approveSubmission(first.id, admin.id)

    const second = await makeSubmission(b.id, b.memberCode, APRIL, {
      sendingDate: '2026-05-03',
      amountPaisa: DUE_PAISA + FINE_PAISA + 5_000,
    })
    await approveSubmission(second.id, admin.id)

    await createTransaction(
      {
        type: 'EXPENSE',
        expenseCategoryText: 'ছাপার খরচ',
        expenseCategoryId: null,
        amount: 12_000,
        note: 'রসিদ ছাপা',
        entryDate: parseCivilDate('2026-04-15'),
      },
      admin.id,
    )

    const [dashboard, totals] = await Promise.all([getDashboard(), ledgerTotals()])

    expect(dashboard.totalDueCollectedPaisa).toBe(totals.due)
    expect(dashboard.totalFinesCollectedPaisa).toBe(totals.fine)
    expect(dashboard.totalOtherIncomePaisa).toBe(totals.other)
    expect(dashboard.totalExpensePaisa).toBe(totals.expense)
    expect(dashboard.balancePaisa).toBe(totals.due + totals.fine + totals.other - totals.expense)

    expect(totals.due).toBe(DUE_PAISA * 2)
    expect(totals.fine).toBe(FINE_PAISA)
    expect(totals.other).toBe(5_000)
    expect(dashboard.activeMembers).toBe(2)
  })

  it('counts fines collected, not fines merely charged', async () => {
    await makeMember()
    await generateDuePayments(APRIL)
    await runMonthRollover(afterAprilDeadline)

    const dashboard = await getDashboard()

    // The ৳200 was levied but never paid: it is outstanding, not income.
    expect(dashboard.totalFinesCollectedPaisa).toBe(0)
    expect(dashboard.finesOutstandingPaisa).toBe(FINE_PAISA)
  })

  it('excludes voided transactions from every total', async () => {
    const admin = await makeAdmin()
    const member = await makeMember()
    const submission = await makeSubmission(member.id, member.memberCode, APRIL)
    await approveSubmission(submission.id, admin.id)

    const before = await getDashboard()
    expect(before.totalDueCollectedPaisa).toBe(DUE_PAISA)

    await prisma.transaction.updateMany({
      data: { voidedAt: new Date(), voidReason: 'ভুল এন্ট্রি' },
    })

    const after = await getDashboard()
    expect(after.totalDueCollectedPaisa).toBe(0)
    expect(after.balancePaisa).toBe(0)
  })
})
