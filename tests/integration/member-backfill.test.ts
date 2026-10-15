import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, resetDatabase } from '../helpers/db'
import { makeAdmin, makeDueSetting, makeMember, resetFactorySequence } from '../helpers/factories'
import { importMemberDueBackfill, planMemberDueBackfill } from '@/lib/services/import'
import { importUniformDue } from '@/lib/services/import'
import { getMemberHistory } from '@/lib/services/members'
import { dbDateToCivil, dhakaCivilToInstant, parseCivilDate, type DueMonth } from '@/lib/due-cycle'

const NOV: DueMonth = { dueYear: 2025, dueMonth: 11 }
const DEC: DueMonth = { dueYear: 2025, dueMonth: 12 }
const JAN: DueMonth = { dueYear: 2026, dueMonth: 1 }

/**
 * A fixed clock. A backfill is bounded by the month now open, so a real clock
 * would quietly change which months the tests may touch as the calendar moves.
 */
const NOW = dhakaCivilToInstant(parseCivilDate('2026-04-10'), 12)

describe('member due backfill', () => {
  beforeEach(async () => {
    await resetDatabase()
    resetFactorySequence()
    // Three months at two different prices, so a single typed amount could not
    // produce the right answer.
    await makeDueSetting(NOV, 200_000)
    await makeDueSetting(DEC, 200_000)
    await makeDueSetting(JAN, 300_000)
  })

  it('settles every month at that month’s own price', async () => {
    const admin = await makeAdmin()
    const member = await makeMember({ joinedOn: '2026-03-01' })

    const result = await importMemberDueBackfill(
      { memberCode: member.memberCode, from: NOV, to: JAN, alignJoinedOn: true },
      admin.id,
      NOW,
    )

    expect(result.affected).toBe(3)
    expect(result.totalPaisa).toBe(700_000)

    const rows = await prisma.duePayment.findMany({
      where: { memberId: member.id },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    })
    expect(rows.map((r) => [r.year, r.month, r.amountPaidPaisa, r.finePaisa, r.status])).toEqual([
      [2025, 11, 200_000, 0, 'PAID_ON_TIME'],
      [2025, 12, 200_000, 0, 'PAID_ON_TIME'],
      [2026, 1, 300_000, 0, 'PAID_ON_TIME'],
    ])

    const ledger = await prisma.transaction.aggregate({
      where: { memberId: member.id, incomeCategory: 'MONTHLY_DUE', voidedAt: null },
      _sum: { amountPaisa: true },
      _count: { _all: true },
    })
    expect(ledger._count._all).toBe(3)
    expect(ledger._sum.amountPaisa).toBe(700_000)

    const history = await getMemberHistory(member.id)
    expect(history?.totalContributedPaisa).toBe(700_000)
  })

  it('takes the price from the uniform import when no setting exists', async () => {
    // How the real society's first months were recorded: a uniform import, no
    // MonthlyDueSetting row behind it.
    const admin = await makeAdmin()
    await makeMember({ joinedOn: '2025-01-01' })
    await prisma.monthlyDueSetting.deleteMany({ where: { year: 2025, month: 11 } })
    await importUniformDue({ year: 2025, month: 11, amountPaisa: 250_000 }, admin.id)

    const latecomer = await makeMember({ joinedOn: '2026-03-01' })
    const plan = await planMemberDueBackfill(
      { memberCode: latecomer.memberCode, from: NOV, to: NOV },
      NOW,
    )

    expect(plan.months[0]).toMatchObject({ amountPaisa: 250_000, outcome: 'WILL_ADD' })
  })

  it('moves the joining date back so the months belong to the member', async () => {
    const admin = await makeAdmin()
    const member = await makeMember({ joinedOn: '2026-03-01' })

    await importMemberDueBackfill(
      { memberCode: member.memberCode, from: NOV, to: JAN, alignJoinedOn: true },
      admin.id,
      NOW,
    )

    // The start of November's collection window: early enough that every later
    // uniform import includes this member rather than skipping them by a day.
    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(dbDateToCivil(after.joinedOn)).toEqual({ y: 2025, m: 10, d: 21 })
  })

  it('leaves the joining date alone when not asked', async () => {
    const admin = await makeAdmin()
    const member = await makeMember({ joinedOn: '2026-03-01' })

    await importMemberDueBackfill(
      { memberCode: member.memberCode, from: NOV, to: JAN, alignJoinedOn: false },
      admin.id,
      NOW,
    )

    const after = await prisma.member.findUniqueOrThrow({ where: { id: member.id } })
    expect(dbDateToCivil(after.joinedOn)).toEqual({ y: 2026, m: 3, d: 1 })
  })

  it('never overwrites a month that is already settled', async () => {
    const admin = await makeAdmin()
    const member = await makeMember({ joinedOn: '2026-03-01' })

    // December already paid, at a different amount and by another route.
    await prisma.duePayment.create({
      data: {
        memberId: member.id,
        year: 2025,
        month: 12,
        amountDuePaisa: 200_000,
        amountPaidPaisa: 190_000,
        status: 'PAID_LATE',
      },
    })

    const plan = await planMemberDueBackfill(
      { memberCode: member.memberCode, from: NOV, to: JAN },
      NOW,
    )
    expect(plan.alreadyPaidCount).toBe(1)
    expect(plan.addCount).toBe(2)
    expect(plan.totalPaisa).toBe(500_000)

    await importMemberDueBackfill(
      { memberCode: member.memberCode, from: NOV, to: JAN, alignJoinedOn: false },
      admin.id,
      NOW,
    )

    const december = await prisma.duePayment.findFirstOrThrow({
      where: { memberId: member.id, year: 2025, month: 12 },
    })
    expect(december.amountPaidPaisa).toBe(190_000)
    expect(december.status).toBe('PAID_LATE')
  })

  it('refuses a month the society never priced', async () => {
    const admin = await makeAdmin()
    const member = await makeMember({ joinedOn: '2026-03-01' })
    await prisma.monthlyDueSetting.deleteMany({ where: { year: 2025, month: 12 } })

    const plan = await planMemberDueBackfill(
      { memberCode: member.memberCode, from: NOV, to: JAN },
      NOW,
    )
    expect(plan.unpricedCount).toBe(1)

    await expect(
      importMemberDueBackfill(
        { memberCode: member.memberCode, from: NOV, to: JAN, alignJoinedOn: false },
        admin.id,
        NOW,
      ),
    ).rejects.toMatchObject({ status: 422 })

    // Nothing was written, not even the months that were priced.
    expect(await prisma.duePayment.count({ where: { memberId: member.id } })).toBe(0)
  })

  it('refuses a second run rather than doubling the ledger', async () => {
    const admin = await makeAdmin()
    const member = await makeMember({ joinedOn: '2026-03-01' })
    const input = { memberCode: member.memberCode, from: NOV, to: JAN, alignJoinedOn: false }

    await importMemberDueBackfill(input, admin.id, NOW)
    await expect(importMemberDueBackfill(input, admin.id, NOW)).rejects.toMatchObject({
      status: 409,
    })

    const ledger = await prisma.transaction.aggregate({
      where: { memberId: member.id, voidedAt: null },
      _sum: { amountPaisa: true },
    })
    expect(ledger._sum.amountPaisa).toBe(700_000)
  })

  it('refuses a range that runs backwards, and a month before the society began', async () => {
    const member = await makeMember()

    await expect(
      planMemberDueBackfill({ memberCode: member.memberCode, from: JAN, to: NOV }, NOW),
    ).rejects.toMatchObject({ status: 422 })

    await expect(
      planMemberDueBackfill(
        { memberCode: member.memberCode, from: { dueYear: 2025, dueMonth: 9 }, to: JAN },
        NOW,
      ),
    ).rejects.toMatchObject({ status: 422 })
  })
})
