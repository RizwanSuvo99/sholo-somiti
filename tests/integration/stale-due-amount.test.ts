import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, resetDatabase } from '../helpers/db'
import {
  makeAdmin,
  makeDueSetting,
  makeMember,
  makeSubmission,
  resetFactorySequence,
} from '../helpers/factories'
import { approveSubmission, lookupMember } from '@/lib/services/submissions'
import { generateDuePayments } from '@/lib/services/dues'
import type { DueMonth } from '@/lib/due-cycle'

/**
 * A month opened before the admin priced it.
 *
 * The rollover creates a row for every member the moment a cycle opens. If no
 * MonthlyDueSetting exists yet it stores `amountDuePaisa = 0`, and setting the
 * amount afterwards does not revisit rows already created. So the row sits at
 * zero while the month genuinely costs ৳3,000.
 *
 * `lookupMember` already handles this — it quotes the live setting when the row
 * reads zero. Approval has to reach the same number, or the member pays the
 * amount the form asked for and it is filed as surplus "other income" instead
 * of their subscription.
 */
const NOVEMBER: DueMonth = { dueYear: 2026, dueMonth: 11 }
const PRICE = 300_000

beforeEach(async () => {
  await resetDatabase()
  resetFactorySequence()
})

/** Open November for everyone *before* the amount is known, then price it. */
async function openUnpricedThenPrice() {
  await generateDuePayments(NOVEMBER)
  await makeDueSetting(NOVEMBER, PRICE)
}

describe('a due row opened before its month was priced', () => {
  it('is stored at zero, which is the condition under test', async () => {
    const member = await makeMember()
    await openUnpricedThenPrice()

    const row = await prisma.duePayment.findUniqueOrThrow({
      where: { memberId_year_month: { memberId: member.id, year: 2026, month: 11 } },
    })
    expect(row.amountDuePaisa).toBe(0)
  })

  it('the form still quotes the real price', async () => {
    const member = await makeMember()
    await openUnpricedThenPrice()

    const lookup = await lookupMember(member.memberCode, new Date('2026-11-05T06:00:00.000Z'))
    const november = lookup?.eligibleDueMonths.find((month) => month.dueMonth === 11)

    expect(november?.amountPaisa).toBe(PRICE)
    expect(november?.outstandingDuePaisa).toBe(PRICE)
  })

  it('credits the payment to the month, not to other income', async () => {
    const admin = await makeAdmin()
    const member = await makeMember()
    await openUnpricedThenPrice()

    const submission = await makeSubmission(member.id, member.memberCode, NOVEMBER, {
      sendingDate: '2026-10-25',
      amountPaisa: PRICE,
    })

    const result = await approveSubmission(submission.id, admin.id)

    expect(result.surplusPaisa).toBe(0)
    expect(result.months).toHaveLength(1)
    expect(result.months[0]).toMatchObject({ dueYear: 2026, dueMonth: 11, duePaidPaisa: PRICE })

    const row = await prisma.duePayment.findUniqueOrThrow({
      where: { memberId_year_month: { memberId: member.id, year: 2026, month: 11 } },
    })
    expect(row.amountDuePaisa).toBe(PRICE)
    expect(row.amountPaidPaisa).toBe(PRICE)
    expect(row.status).toBe('PAID_ON_TIME')
  })

  it('books it as MONTHLY_DUE, with no surplus row at all', async () => {
    const admin = await makeAdmin()
    const member = await makeMember()
    await openUnpricedThenPrice()

    const submission = await makeSubmission(member.id, member.memberCode, NOVEMBER, {
      sendingDate: '2026-10-25',
      amountPaisa: PRICE,
    })
    await approveSubmission(submission.id, admin.id)

    const ledger = await prisma.transaction.findMany({
      where: { sourceSubmissionId: submission.id },
      select: { incomeCategory: true, amountPaisa: true },
    })

    expect(ledger).toEqual([{ incomeCategory: 'MONTHLY_DUE', amountPaisa: PRICE }])
  })

  /**
   * The control case, and the one that already worked: a member who joined
   * after the cycle opened has no row, so approval reads the setting directly.
   * Both paths must now agree.
   */
  it('matches a member who had no row at all', async () => {
    const admin = await makeAdmin()
    await openUnpricedThenPrice()

    // Joined after November opened, so generateDuePayments gave them nothing.
    const latecomer = await makeMember({ joinedOn: '2026-10-28' })
    const submission = await makeSubmission(latecomer.id, latecomer.memberCode, NOVEMBER, {
      sendingDate: '2026-10-29',
      amountPaisa: PRICE,
    })

    const result = await approveSubmission(submission.id, admin.id)

    expect(result.surplusPaisa).toBe(0)
    const ledger = await prisma.transaction.findMany({
      where: { sourceSubmissionId: submission.id },
      select: { incomeCategory: true, amountPaisa: true },
    })
    expect(ledger).toEqual([{ incomeCategory: 'MONTHLY_DUE', amountPaisa: PRICE }])
  })

  /**
   * The snapshot still wins when it carries a real figure: a member billed
   * ৳2,000 owes ৳2,000 even if the admin later raised the month to ৳3,000.
   */
  it('does not let a later price change rewrite what a member was billed', async () => {
    const admin = await makeAdmin()
    const member = await makeMember()
    await makeDueSetting(NOVEMBER, 200_000)
    await generateDuePayments(NOVEMBER)
    await makeDueSetting(NOVEMBER, PRICE)

    const submission = await makeSubmission(member.id, member.memberCode, NOVEMBER, {
      sendingDate: '2026-10-25',
      amountPaisa: 200_000,
    })

    const result = await approveSubmission(submission.id, admin.id)

    expect(result.surplusPaisa).toBe(0)
    const row = await prisma.duePayment.findUniqueOrThrow({
      where: { memberId_year_month: { memberId: member.id, year: 2026, month: 11 } },
    })
    expect(row.amountDuePaisa).toBe(200_000)
    expect(row.amountPaidPaisa).toBe(200_000)
  })
})

/**
 * The upstream cause of all of the above: the month gets a price only after its
 * rows already exist. Pricing it should reach those rows, so the stale zero
 * stops existing in the first place rather than being compensated for at every
 * point that reads it.
 */
describe('pricing a month that is already open', () => {
  it('bills the rows that were opened before the price was known', async () => {
    const { upsertDueSetting } = await import('@/lib/services/dues')
    const member = await makeMember()
    await generateDuePayments(NOVEMBER)

    await upsertDueSetting(NOVEMBER, PRICE)

    const row = await prisma.duePayment.findUniqueOrThrow({
      where: { memberId_year_month: { memberId: member.id, year: 2026, month: 11 } },
    })
    expect(row.amountDuePaisa).toBe(PRICE)
  })

  it('leaves a month alone once somebody has paid it', async () => {
    const { upsertDueSetting } = await import('@/lib/services/dues')
    const admin = await makeAdmin()
    const member = await makeMember()
    await makeDueSetting(NOVEMBER, 200_000)
    await generateDuePayments(NOVEMBER)

    const submission = await makeSubmission(member.id, member.memberCode, NOVEMBER, {
      sendingDate: '2026-10-25',
      amountPaisa: 200_000,
    })
    await approveSubmission(submission.id, admin.id)

    // Raising the price afterwards must not re-bill a settled month, or a
    // member who paid in full would suddenly owe the difference.
    await upsertDueSetting(NOVEMBER, PRICE)

    const row = await prisma.duePayment.findUniqueOrThrow({
      where: { memberId_year_month: { memberId: member.id, year: 2026, month: 11 } },
    })
    expect(row.amountDuePaisa).toBe(200_000)
    expect(row.status).toBe('PAID_ON_TIME')
  })

  it('does not overwrite a row that was already billed a real amount', async () => {
    const { upsertDueSetting } = await import('@/lib/services/dues')
    const member = await makeMember()
    await makeDueSetting(NOVEMBER, 200_000)
    await generateDuePayments(NOVEMBER)

    await upsertDueSetting(NOVEMBER, PRICE)

    // Still unpaid, but it carries a genuine figure the member was billed, so
    // a correction to the month's price does reach it.
    const row = await prisma.duePayment.findUniqueOrThrow({
      where: { memberId_year_month: { memberId: member.id, year: 2026, month: 11 } },
    })
    expect(row.amountDuePaisa).toBe(PRICE)
  })
})
