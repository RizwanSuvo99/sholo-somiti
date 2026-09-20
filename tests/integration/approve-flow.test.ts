import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, resetDatabase } from '../helpers/db'
import { makeAdmin, makeDueSetting, makeMember, makeSubmission, resetFactorySequence } from '../helpers/factories'
import { approveSubmission, rejectSubmission } from '@/lib/services/submissions'
import { generateDuePayments } from '@/lib/services/dues'
import { FINE_PAISA } from '@/lib/fines'
import type { DueMonth } from '@/lib/due-cycle'

const APRIL: DueMonth = { dueYear: 2026, dueMonth: 4 }
const NOVEMBER: DueMonth = { dueYear: 2025, dueMonth: 11 }
const DECEMBER: DueMonth = { dueYear: 2025, dueMonth: 12 }
const JANUARY: DueMonth = { dueYear: 2026, dueMonth: 1 }
const FEBRUARY: DueMonth = { dueYear: 2026, dueMonth: 2 }
const DUE_PAISA = 50_000

describe('approving a submission', () => {
  beforeEach(async () => {
    await resetDatabase()
    resetFactorySequence()
    await makeDueSetting(APRIL, DUE_PAISA)
  })

  it('settles an on-time payment with no fine', async () => {
    const admin = await makeAdmin()
    const member = await makeMember()
    const submission = await makeSubmission(member.id, member.memberCode, APRIL, {
      sendingDate: '2026-04-10',
    })

    const result = await approveSubmission(submission.id, admin.id)

    expect(result.months).toHaveLength(1)
    expect(result.months[0]).toMatchObject({ status: 'PAID_ON_TIME', finePaidPaisa: 0 })

    const due = await prisma.duePayment.findUniqueOrThrow({
      where: { memberId_year_month: { memberId: member.id, year: 2026, month: 4 } },
    })
    expect(due.status).toBe('PAID_ON_TIME')
    expect(due.amountPaidPaisa).toBe(DUE_PAISA)
    expect(due.sourceSubmissionId).toBe(submission.id)
    // Paid when the member sent it, not when it was reviewed.
    expect(due.paidAt?.toISOString()).toBe('2026-04-10T00:00:00.000Z')

    const ledger = await prisma.transaction.findMany()
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({ type: 'INCOME', incomeCategory: 'MONTHLY_DUE', amountPaisa: DUE_PAISA })
  })

  it('settles a late payment as PAID_LATE with the ৳200 fine', async () => {
    // April's due, sent on 3 May — the case the due-month selector exists for.
    const admin = await makeAdmin()
    const member = await makeMember()
    const submission = await makeSubmission(member.id, member.memberCode, APRIL, {
      sendingDate: '2026-05-03',
      amountPaisa: DUE_PAISA + FINE_PAISA,
    })

    const result = await approveSubmission(submission.id, admin.id)

    expect(result.months[0]).toMatchObject({ status: 'PAID_LATE', finePaidPaisa: FINE_PAISA })

    const due = await prisma.duePayment.findUniqueOrThrow({
      where: { memberId_year_month: { memberId: member.id, year: 2026, month: 4 } },
    })
    expect(due.status).toBe('PAID_LATE')
    expect(due.finePaisa).toBe(FINE_PAISA)
    expect(due.finePaidPaisa).toBe(FINE_PAISA)

    const categories = (await prisma.transaction.findMany()).map((t) => t.incomeCategory).sort()
    expect(categories).toEqual(['FINE', 'MONTHLY_DUE'])
  })

  it('judges lateness by the sending date, not the review date', async () => {
    // Sent well before the deadline but reviewed months later: still on time.
    const admin = await makeAdmin()
    const member = await makeMember()
    const submission = await makeSubmission(member.id, member.memberCode, APRIL, {
      sendingDate: '2026-04-18',
    })

    const result = await approveSubmission(submission.id, admin.id)

    expect(result.months[0]).toMatchObject({ status: 'PAID_ON_TIME', finePaidPaisa: 0 })
  })

  it('books an overpayment as other income', async () => {
    const admin = await makeAdmin()
    const member = await makeMember()
    const submission = await makeSubmission(member.id, member.memberCode, APRIL, {
      sendingDate: '2026-04-10',
      amountPaisa: DUE_PAISA + 10_000,
    })

    const result = await approveSubmission(submission.id, admin.id)

    expect(result.months[0]).toMatchObject({ duePaidPaisa: DUE_PAISA, finePaidPaisa: 0 })
    expect(result.surplusPaisa).toBe(10_000)
    expect(result.warnings).toContain('OVERPAID')

    const surplus = await prisma.transaction.findFirst({ where: { incomeCategory: 'OTHER_INCOME' } })
    expect(surplus?.amountPaisa).toBe(10_000)
  })

  it('pays the subscription before the fine when the amount falls short', async () => {
    const admin = await makeAdmin()
    const member = await makeMember()
    const submission = await makeSubmission(member.id, member.memberCode, APRIL, {
      sendingDate: '2026-05-03',
      amountPaisa: DUE_PAISA, // covers the due but not the ৳200 fine
    })

    const result = await approveSubmission(submission.id, admin.id)

    expect(result.months[0]).toMatchObject({ duePaidPaisa: DUE_PAISA, finePaidPaisa: 0 })
    expect(result.shortfallPaisa).toBe(FINE_PAISA)
    expect(result.warnings).toContain('UNDERPAID')

    const due = await prisma.duePayment.findUniqueOrThrow({
      where: { memberId_year_month: { memberId: member.id, year: 2026, month: 4 } },
    })
    // Charged but not collected — the dashboard counts only what came in.
    expect(due.finePaisa).toBe(FINE_PAISA)
    expect(due.finePaidPaisa).toBe(0)
  })

  it('lets only one of two simultaneous approvals through', async () => {
    const admin = await makeAdmin()
    const member = await makeMember()
    const submission = await makeSubmission(member.id, member.memberCode, APRIL)

    const results = await Promise.allSettled([
      approveSubmission(submission.id, admin.id),
      approveSubmission(submission.id, admin.id),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)

    // The idempotency key makes the ledger assertion meaningful: even if both
    // had proceeded, there could only ever be one MONTHLY_DUE row.
    expect(await prisma.transaction.count({ where: { incomeCategory: 'MONTHLY_DUE' } })).toBe(1)
  })

  it('refuses to approve an already-reviewed submission', async () => {
    const admin = await makeAdmin()
    const member = await makeMember()
    const submission = await makeSubmission(member.id, member.memberCode, APRIL)

    await rejectSubmission(submission.id, admin.id, 'ভুল তথ্য')

    await expect(approveSubmission(submission.id, admin.id)).rejects.toMatchObject({
      code: 'SUBMISSION_ALREADY_REVIEWED',
    })
  })

  it('refuses a month that is already settled', async () => {
    const admin = await makeAdmin()
    const member = await makeMember()

    const first = await makeSubmission(member.id, member.memberCode, APRIL)
    await approveSubmission(first.id, admin.id)

    // Only reachable after a rejection frees the slot; the second proof must not
    // double-count the month — duplicates go through manual admin entry instead.
    await prisma.paymentSubmission.update({
      where: { id: first.id },
      data: { status: 'REJECTED', rejectionReason: 'x' },
    })
    const second = await makeSubmission(member.id, member.memberCode, APRIL)

    await expect(approveSubmission(second.id, admin.id)).rejects.toMatchObject({
      code: 'ALREADY_PAID',
    })
  })

  it('clears a missed month, its fine and the current month in one payment', async () => {
    // The case from the brief: November missed and fined, December due, paid
    // together as ৳500 + ৳200 + ৳500.
    const admin = await makeAdmin()
    const member = await makeMember()

    await makeDueSetting(NOVEMBER, DUE_PAISA)
    await makeDueSetting(DECEMBER, DUE_PAISA)
    await generateDuePayments(NOVEMBER)
    await generateDuePayments(DECEMBER)

    // November's deadline passed unpaid, so the rollover levied the fine.
    await prisma.duePayment.updateMany({
      where: { memberId: member.id, year: 2025, month: 11 },
      data: { status: 'UNPAID', finePaisa: FINE_PAISA },
    })

    const submission = await makeSubmission(member.id, member.memberCode, DECEMBER, {
      sendingDate: '2025-12-18',
      amountPaisa: DUE_PAISA * 2 + FINE_PAISA,
    })

    const result = await approveSubmission(submission.id, admin.id)

    expect(result.totalOwedPaisa).toBe(DUE_PAISA * 2 + FINE_PAISA)
    expect(result.shortfallPaisa).toBe(0)
    expect(result.surplusPaisa).toBe(0)
    expect(result.months).toHaveLength(2)

    const november = await prisma.duePayment.findUniqueOrThrow({
      where: { memberId_year_month: { memberId: member.id, year: 2025, month: 11 } },
    })
    expect(november.status).toBe('PAID_LATE')
    expect(november.amountPaidPaisa).toBe(DUE_PAISA)
    expect(november.finePaidPaisa).toBe(FINE_PAISA)

    const december = await prisma.duePayment.findUniqueOrThrow({
      where: { memberId_year_month: { memberId: member.id, year: 2025, month: 12 } },
    })
    expect(december.status).toBe('PAID_ON_TIME')
    expect(december.amountPaidPaisa).toBe(DUE_PAISA)

    // One proof backs several rows now, which the dropped unique index allows.
    expect(november.sourceSubmissionId).toBe(submission.id)
    expect(december.sourceSubmissionId).toBe(submission.id)

    const ledger = await prisma.transaction.findMany({ orderBy: { idempotencyKey: 'asc' } })
    expect(ledger).toHaveLength(3)
    expect(ledger.map((row) => row.incomeCategory).sort()).toEqual([
      'FINE',
      'MONTHLY_DUE',
      'MONTHLY_DUE',
    ])
  })

  it('charges a separate fine for each of three consecutive months missed', async () => {
    const admin = await makeAdmin()
    const member = await makeMember()

    for (const dm of [NOVEMBER, DECEMBER, JANUARY, FEBRUARY]) {
      await makeDueSetting(dm, DUE_PAISA)
      await generateDuePayments(dm)
    }

    // Three deadlines passed unpaid: three fines, one per month.
    await prisma.duePayment.updateMany({
      where: { memberId: member.id, OR: [{ year: 2025 }, { year: 2026, month: 1 }] },
      data: { status: 'UNPAID', finePaisa: FINE_PAISA },
    })

    const owed = DUE_PAISA * 4 + FINE_PAISA * 3
    const submission = await makeSubmission(member.id, member.memberCode, FEBRUARY, {
      sendingDate: '2026-02-18',
      amountPaisa: owed,
    })

    const result = await approveSubmission(submission.id, admin.id)

    expect(result.totalOwedPaisa).toBe(owed)
    expect(result.shortfallPaisa).toBe(0)
    expect(result.months.map((m) => m.finePaidPaisa)).toEqual([
      FINE_PAISA,
      FINE_PAISA,
      FINE_PAISA,
      0,
    ])

    const fines = await prisma.transaction.aggregate({
      where: { incomeCategory: 'FINE' },
      _sum: { amountPaisa: true },
    })
    expect(fines._sum.amountPaisa).toBe(FINE_PAISA * 3)
  })

  it('settles the oldest month first when the payment falls short', async () => {
    const admin = await makeAdmin()
    const member = await makeMember()

    await makeDueSetting(NOVEMBER, DUE_PAISA)
    await makeDueSetting(DECEMBER, DUE_PAISA)
    await generateDuePayments(NOVEMBER)
    await generateDuePayments(DECEMBER)
    await prisma.duePayment.updateMany({
      where: { memberId: member.id, year: 2025, month: 11 },
      data: { status: 'UNPAID', finePaisa: FINE_PAISA },
    })

    // Only enough for November's due and fine.
    const submission = await makeSubmission(member.id, member.memberCode, DECEMBER, {
      sendingDate: '2025-12-18',
      amountPaisa: DUE_PAISA + FINE_PAISA,
    })

    const result = await approveSubmission(submission.id, admin.id)

    expect(result.shortfallPaisa).toBe(DUE_PAISA)
    expect(result.warnings).toContain('UNDERPAID')

    const november = await prisma.duePayment.findUniqueOrThrow({
      where: { memberId_year_month: { memberId: member.id, year: 2025, month: 11 } },
    })
    expect(november.status).toBe('PAID_LATE')

    // December got nothing, so it stays open rather than looking settled.
    const december = await prisma.duePayment.findUniqueOrThrow({
      where: { memberId_year_month: { memberId: member.id, year: 2025, month: 12 } },
    })
    expect(december.status).toBe('PENDING')
    expect(december.amountPaidPaisa).toBe(0)
  })

  it('leaves months claimed by another pending submission alone', async () => {
    // That money is already spoken for; settling it here would take payment
    // for the same month twice.
    const admin = await makeAdmin()
    const member = await makeMember()

    await makeDueSetting(NOVEMBER, DUE_PAISA)
    await makeDueSetting(DECEMBER, DUE_PAISA)
    await generateDuePayments(NOVEMBER)
    await generateDuePayments(DECEMBER)

    await makeSubmission(member.id, member.memberCode, NOVEMBER, {
      sendingDate: '2025-11-18',
      amountPaisa: DUE_PAISA,
    })
    const december = await makeSubmission(member.id, member.memberCode, DECEMBER, {
      sendingDate: '2025-12-18',
      amountPaisa: DUE_PAISA,
    })

    const result = await approveSubmission(december.id, admin.id)

    expect(result.months.map((m) => m.dueMonth)).toEqual([12])
    const november = await prisma.duePayment.findUniqueOrThrow({
      where: { memberId_year_month: { memberId: member.id, year: 2025, month: 11 } },
    })
    expect(november.status).toBe('PENDING')
  })

  it('writes no ledger rows when a submission is rejected', async () => {
    const admin = await makeAdmin()
    const member = await makeMember()
    const submission = await makeSubmission(member.id, member.memberCode, APRIL)

    await rejectSubmission(submission.id, admin.id, 'স্ক্রিনশট অস্পষ্ট')

    expect(await prisma.transaction.count()).toBe(0)
    expect(await prisma.duePayment.count()).toBe(0)
  })
})
