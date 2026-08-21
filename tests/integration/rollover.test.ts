import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, resetDatabase } from '../helpers/db'
import { makeDueSetting, makeMember, resetFactorySequence } from '../helpers/factories'
import { generateDuePayments } from '@/lib/services/dues'
import { runMonthRollover } from '@/lib/services/rollover'
import { FINE_PAISA } from '@/lib/fines'
import { dhakaCivilToInstant, parseCivilDate, type DueMonth } from '@/lib/due-cycle'

const APRIL: DueMonth = { dueYear: 2026, dueMonth: 4 }
const MAY: DueMonth = { dueYear: 2026, dueMonth: 5 }

/** An instant just after April's deadline (20 April 23:59:59 Dhaka). */
const afterAprilDeadline = dhakaCivilToInstant(parseCivilDate('2026-04-21'), 0, 5)

async function snapshot() {
  const [dues, transactions, jobRuns] = await Promise.all([
    prisma.duePayment.findMany({ orderBy: [{ year: 'asc' }, { month: 'asc' }, { memberId: 'asc' }] }),
    prisma.transaction.findMany({ orderBy: { id: 'asc' } }),
    prisma.jobRun.count(),
  ])
  return {
    dues: dues.map((d) => ({ y: d.year, m: d.month, status: d.status, fine: d.finePaisa })),
    transactionCount: transactions.length,
    jobRuns,
  }
}

describe('month rollover', () => {
  beforeEach(async () => {
    await resetDatabase()
    resetFactorySequence()
    await makeDueSetting(APRIL, 50_000)
    await makeDueSetting(MAY, 50_000)
  })

  it('never touches the month still open for collection', async () => {
    // Run at noon on 20 April, while April's window is still open. The job must
    // close March and leave April alone.
    await makeMember()
    await makeDueSetting({ dueYear: 2026, dueMonth: 3 }, 50_000)
    await generateDuePayments({ dueYear: 2026, dueMonth: 3 })
    await generateDuePayments(APRIL)

    const midWindow = dhakaCivilToInstant(parseCivilDate('2026-04-20'), 12)
    const result = await runMonthRollover(midWindow)

    expect(result.months.map((m) => m.periodKey)).toEqual(['2026-03'])

    const april = await prisma.duePayment.findMany({ where: { year: 2026, month: 4 } })
    expect(april.every((row) => row.status === 'PENDING')).toBe(true)
    expect(april.every((row) => row.finePaisa === 0)).toBe(true)
  })

  it('closes only the most recent month on a cold start', async () => {
    // With no run history there is nothing to heal. Sweeping backwards here
    // would invent due rows for months the society never collected.
    await makeMember()
    await generateDuePayments(APRIL)

    const result = await runMonthRollover(afterAprilDeadline)

    expect(result.months.map((m) => m.periodKey)).toEqual(['2026-04'])
    const months = await prisma.duePayment.findMany({ select: { year: true, month: true } })
    expect(new Set(months.map((m) => `${m.year}-${m.month}`))).toEqual(
      new Set(['2026-4', '2026-5']),
    )
  })

  it('fines unpaid members and opens the next month', async () => {
    await makeMember()
    await makeMember()
    await makeMember()
    await generateDuePayments(APRIL)

    const result = await runMonthRollover(afterAprilDeadline)
    expect(result.ran).toBe(true)

    const april = await prisma.duePayment.findMany({ where: { year: 2026, month: 4 } })
    expect(april).toHaveLength(3)
    expect(april.every((row) => row.status === 'UNPAID')).toBe(true)
    expect(april.every((row) => row.finePaisa === FINE_PAISA)).toBe(true)

    const may = await prisma.duePayment.findMany({ where: { year: 2026, month: 5 } })
    expect(may).toHaveLength(3)
    expect(may.every((row) => row.status === 'PENDING')).toBe(true)
  })

  it('creates no FINE income when a fine is merely levied', async () => {
    // A charged fine is a receivable, not cash. Booking it here would overstate
    // "fines collected" on the dashboard.
    await makeMember()
    await generateDuePayments(APRIL)

    await runMonthRollover(afterAprilDeadline)

    expect(await prisma.transaction.count({ where: { incomeCategory: 'FINE' } })).toBe(0)
  })

  it('is a no-op when run again', async () => {
    await makeMember()
    await makeMember()
    await generateDuePayments(APRIL)

    await runMonthRollover(afterAprilDeadline)
    const first = await snapshot()

    await runMonthRollover(afterAprilDeadline)
    await runMonthRollover(afterAprilDeadline)
    const third = await snapshot()

    expect(third).toEqual(first)
  })

  it('cannot double-fine even across repeated runs', async () => {
    await makeMember()
    await generateDuePayments(APRIL)

    await runMonthRollover(afterAprilDeadline)
    await runMonthRollover(afterAprilDeadline)

    const [row] = await prisma.duePayment.findMany({ where: { year: 2026, month: 4 } })
    expect(row.finePaisa).toBe(FINE_PAISA)
  })

  it('leaves an already-paid month untouched', async () => {
    const member = await makeMember()
    await generateDuePayments(APRIL)
    await prisma.duePayment.updateMany({
      where: { memberId: member.id, year: 2026, month: 4 },
      data: { status: 'PAID_ON_TIME', amountPaidPaisa: 50_000 },
    })

    await runMonthRollover(afterAprilDeadline)

    const row = await prisma.duePayment.findUniqueOrThrow({
      where: { memberId_year_month: { memberId: member.id, year: 2026, month: 4 } },
    })
    expect(row.status).toBe('PAID_ON_TIME')
    expect(row.finePaisa).toBe(0)
  })

  it('back-fills months missed after a previous successful run', async () => {
    await makeMember()
    for (const dm of [
      { dueYear: 2026, dueMonth: 2 },
      { dueYear: 2026, dueMonth: 3 },
      APRIL,
    ]) {
      await makeDueSetting(dm, 50_000)
      await generateDuePayments(dm)
    }

    // The job last ran for January, then the server was down for three months.
    await prisma.jobRun.create({
      data: { job: 'month-rollover', periodKey: '2026-01', finishedAt: new Date() },
    })

    const result = await runMonthRollover(afterAprilDeadline)

    // February, March and April all closed by the single run.
    const closed = result.months.filter((m) => m.status === 'CLOSED').map((m) => m.periodKey)
    expect(closed).toEqual(['2026-02', '2026-03', '2026-04'])

    const unpaid = await prisma.duePayment.count({ where: { status: 'UNPAID' } })
    expect(unpaid).toBe(3)
  })

  it('still opens a month whose due amount has not been set', async () => {
    // Skipping would silently lose a month of dues, so rows are created at zero
    // and the dashboard flags it instead.
    await prisma.monthlyDueSetting.deleteMany({ where: { year: 2026, month: 5 } })
    await makeMember()
    await generateDuePayments(APRIL)

    const result = await runMonthRollover(afterAprilDeadline)

    const may = await prisma.duePayment.findMany({ where: { year: 2026, month: 5 } })
    expect(may).toHaveLength(1)
    expect(may[0].amountDuePaisa).toBe(0)

    const closed = result.months.find((m) => m.status === 'CLOSED')
    expect(closed && 'warnings' in closed ? closed.warnings : []).toContain('DUE_SETTING_MISSING')
  })

  it('does not bill a member who joined after the window opened', async () => {
    // April's window opened on 21 March; this member joined after it.
    await makeMember({ joinedOn: '2026-04-01' })
    const result = await generateDuePayments(APRIL)

    expect(result.created).toBe(0)
  })
})
