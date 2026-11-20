import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, resetDatabase } from '../helpers/db'
import {
  makeAdmin,
  makeDueSetting,
  makeMember,
  makeSubmission,
  resetFactorySequence,
} from '../helpers/factories'
import { approveSubmission, createSubmission, lookupMember } from '@/lib/services/submissions'
import { generateDuePayments } from '@/lib/services/dues'
import type { DueMonth } from '@/lib/due-cycle'

/**
 * One form per cycle, carrying the arrears with it.
 *
 * A member who misses a month does not file a second form for it later: the
 * window for that month has closed. They file one form in the open cycle, and
 * it settles the arrears, the fine and the current month together.
 *
 * NHSS-25024 is why this file exists. On 20 November he filed ৳10,200 for
 * November — correct, and it covered October too. Three minutes later he filed
 * ৳7,200 for October, which was already in that first form. October's window
 * had closed on 20 October, so the second form should have been impossible;
 * instead both were approved and ৳7,200 was counted twice.
 */
const OCTOBER: DueMonth = { dueYear: 2026, dueMonth: 10 }
const NOVEMBER: DueMonth = { dueYear: 2026, dueMonth: 11 }
const OCT_PRICE = 700_000
const NOV_PRICE = 300_000
const FINE = 20_000
/** Inside November's window (21 Oct – 20 Nov), on its very last day. */
const SENT_ON = '2026-11-20'
/** Same instant, as the clock the server would read. */
const NOW = new Date('2026-11-20T08:00:00.000Z')

beforeEach(async () => {
  await resetDatabase()
  resetFactorySequence()
})

/** A member who owes October and November, with nothing paid against either. */
async function memberOwingBothMonths() {
  const member = await makeMember({ joinedOn: '2025-10-01' })
  await makeDueSetting(OCTOBER, OCT_PRICE)
  await generateDuePayments(OCTOBER)
  await makeDueSetting(NOVEMBER, NOV_PRICE)
  await generateDuePayments(NOVEMBER)
  return member
}

describe('one form settling two months', () => {
  it('quotes the arrears, the fine and the current month as a single total', async () => {
    const member = await memberOwingBothMonths()

    const lookup = await lookupMember(member.memberCode, NOW)
    const november = lookup?.eligibleDueMonths.find((m) => m.dueMonth === 11)
    const october = lookup?.eligibleDueMonths.find((m) => m.dueMonth === 10)

    expect(october?.outstandingDuePaisa).toBe(OCT_PRICE)
    expect(november?.outstandingDuePaisa).toBe(NOV_PRICE)
  })

  it('settles both months and the fine from one payment', async () => {
    const member = await memberOwingBothMonths()
    const admin = await makeAdmin()
    const submission = await makeSubmission(member.id, member.memberCode, NOVEMBER, {
      sendingDate: SENT_ON,
      amountPaisa: OCT_PRICE + FINE + NOV_PRICE,
    })

    await approveSubmission(submission.id, admin.id)

    const rows = await prisma.duePayment.findMany({
      where: { memberId: member.id },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    })
    const october = rows.find((r) => r.month === 10)
    const november = rows.find((r) => r.month === 11)

    expect(october?.amountPaidPaisa).toBe(OCT_PRICE)
    expect(october?.finePaidPaisa).toBe(FINE)
    expect(october?.status).toBe('PAID_LATE')
    expect(november?.amountPaidPaisa).toBe(NOV_PRICE)
    expect(november?.status).toBe('PAID_ON_TIME')
  })

  it('leaves nothing over as surplus other income', async () => {
    const member = await memberOwingBothMonths()
    const admin = await makeAdmin()
    const submission = await makeSubmission(member.id, member.memberCode, NOVEMBER, {
      sendingDate: SENT_ON,
      amountPaisa: OCT_PRICE + FINE + NOV_PRICE,
    })

    await approveSubmission(submission.id, admin.id)

    const surplus = await prisma.transaction.findMany({
      where: { memberId: member.id, incomeCategory: 'OTHER_INCOME', voidedAt: null },
    })
    expect(surplus).toEqual([])

    const booked = await prisma.transaction.groupBy({
      by: ['incomeCategory'],
      where: { memberId: member.id, voidedAt: null },
      _sum: { amountPaisa: true },
    })
    expect(booked.find((b) => b.incomeCategory === 'MONTHLY_DUE')?._sum.amountPaisa).toBe(
      OCT_PRICE + NOV_PRICE,
    )
    expect(booked.find((b) => b.incomeCategory === 'FINE')?._sum.amountPaisa).toBe(FINE)
  })
})

describe('a form may only target the open cycle', () => {
  const base = {
    name: 'সদস্য',
    amountPaisa: OCT_PRICE + FINE,
    transactionRef: 'S72109487',
    paymentMedium: 'MOBILE_BANKING' as const,
    mobileBankingProvider: 'BKASH' as const,
    mobileBankingNumber: '01700000000',
    screenshotUrl: 'https://res.cloudinary.com/demo/image/upload/v1/sholo/proof.jpg',
  }

  it('refuses a month whose window has already closed', async () => {
    const member = await memberOwingBothMonths()

    // 20 November is inside November's window; October's closed a month earlier.
    await expect(
      createSubmission({
        ...base,
        memberCode: member.memberCode,
        sendingDate: { y: 2026, m: 11, d: 20 },
        dueYear: 2026,
        dueMonth: 10,
      }),
    ).rejects.toThrow()
  })

  it('accepts the open cycle', async () => {
    const member = await memberOwingBothMonths()

    const created = await createSubmission({
      ...base,
      memberCode: member.memberCode,
      sendingDate: { y: 2026, m: 11, d: 20 },
      dueYear: 2026,
      dueMonth: 11,
      amountPaisa: OCT_PRICE + FINE + NOV_PRICE,
    })

    expect(created.dueMonth).toBe(11)
  })

  it('refuses a second form for the same month while one awaits review', async () => {
    const member = await memberOwingBothMonths()
    await createSubmission({
      ...base,
      memberCode: member.memberCode,
      sendingDate: { y: 2026, m: 11, d: 20 },
      dueYear: 2026,
      dueMonth: 11,
      amountPaisa: OCT_PRICE + FINE + NOV_PRICE,
    })

    await expect(
      createSubmission({
        ...base,
        memberCode: member.memberCode,
        sendingDate: { y: 2026, m: 11, d: 20 },
        dueYear: 2026,
        dueMonth: 11,
      }),
    ).rejects.toThrow()
  })
})

/**
 * The one-unreviewed-form rule, isolated.
 *
 * The per-month rule cannot cover this: these two forms target *different*
 * months, which is exactly how NHSS-25024's pair slipped past it. Here the
 * second form targets the next cycle legitimately — December's window opens on
 * 21 November — so only the pending rule can refuse it.
 *
 * It has to be refused because two forms in the queue can be approved in either
 * order, and whichever is approved second finds the months already settled and
 * books its money as surplus.
 */
describe('one unreviewed form per member', () => {
  const DECEMBER: DueMonth = { dueYear: 2026, dueMonth: 12 }
  const base = {
    name: 'সদস্য',
    transactionRef: 'S72100001',
    paymentMedium: 'MOBILE_BANKING' as const,
    mobileBankingProvider: 'BKASH' as const,
    mobileBankingNumber: '01700000000',
    screenshotUrl: 'https://res.cloudinary.com/demo/image/upload/v1/sholo/proof.jpg',
  }

  async function fileForNovember(memberCode: string) {
    return createSubmission({
      ...base,
      memberCode,
      sendingDate: { y: 2026, m: 11, d: 20 },
      amountPaisa: OCT_PRICE + FINE + NOV_PRICE,
      dueYear: 2026,
      dueMonth: 11,
    })
  }

  /** 25 November falls in December's window, so this targets a different month. */
  async function fileForDecember(memberCode: string) {
    return createSubmission({
      ...base,
      memberCode,
      sendingDate: { y: 2026, m: 11, d: 25 },
      amountPaisa: NOV_PRICE,
      dueYear: 2026,
      dueMonth: 12,
    })
  }

  it('refuses a form for the next cycle while the last one awaits review', async () => {
    const member = await memberOwingBothMonths()
    await makeDueSetting(DECEMBER, NOV_PRICE)
    await fileForNovember(member.memberCode)

    await expect(fileForDecember(member.memberCode)).rejects.toThrow(
      /already has a submission awaiting review/,
    )
  })

  it('allows it once the first form has been reviewed', async () => {
    const member = await memberOwingBothMonths()
    const admin = await makeAdmin()
    await makeDueSetting(DECEMBER, NOV_PRICE)

    const first = await fileForNovember(member.memberCode)
    await approveSubmission(first.id, admin.id)

    const second = await fileForDecember(member.memberCode)
    expect(second.dueMonth).toBe(12)
  })

  /**
   * The index, not the service check, is what holds under two simultaneous
   * requests — so it is asserted directly, bypassing createSubmission entirely.
   */
  it('is enforced by the database, not only by the service', async () => {
    const member = await memberOwingBothMonths()
    await fileForNovember(member.memberCode)

    await expect(
      makeSubmission(member.id, member.memberCode, DECEMBER, { sendingDate: '2026-11-25' }),
    ).rejects.toThrow(/payment_submissions_one_pending_per_member|Unique constraint/)
  })

  it('still lets a member refile after a rejection', async () => {
    const member = await memberOwingBothMonths()
    const first = await fileForNovember(member.memberCode)
    await prisma.paymentSubmission.update({
      where: { id: first.id },
      data: { status: 'REJECTED', rejectionReason: 'ভুল স্ক্রিনশট' },
    })

    const again = await fileForNovember(member.memberCode)
    expect(again.dueMonth).toBe(11)
  })
})
