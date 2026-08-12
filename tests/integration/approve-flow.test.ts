import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, resetDatabase } from '../helpers/db'
import { makeAdmin, makeDueSetting, makeMember, makeSubmission, resetFactorySequence } from '../helpers/factories'
import { approveSubmission, rejectSubmission } from '@/lib/services/submissions'
import { FINE_PAISA } from '@/lib/fines'
import type { DueMonth } from '@/lib/due-cycle'

const APRIL: DueMonth = { dueYear: 2026, dueMonth: 4 }
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

    expect(result.status).toBe('PAID_ON_TIME')
    expect(result.finePaisa).toBe(0)

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

    expect(result.status).toBe('PAID_LATE')
    expect(result.finePaisa).toBe(FINE_PAISA)

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

    expect(result.status).toBe('PAID_ON_TIME')
    expect(result.finePaisa).toBe(0)
  })

  it('books an overpayment as other income', async () => {
    const admin = await makeAdmin()
    const member = await makeMember()
    const submission = await makeSubmission(member.id, member.memberCode, APRIL, {
      sendingDate: '2026-04-10',
      amountPaisa: DUE_PAISA + 10_000,
    })

    const result = await approveSubmission(submission.id, admin.id)

    expect(result.allocation).toMatchObject({ toDue: DUE_PAISA, toFine: 0, surplus: 10_000 })
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

    expect(result.allocation).toMatchObject({ toDue: DUE_PAISA, toFine: 0, shortfall: FINE_PAISA })
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

  it('writes no ledger rows when a submission is rejected', async () => {
    const admin = await makeAdmin()
    const member = await makeMember()
    const submission = await makeSubmission(member.id, member.memberCode, APRIL)

    await rejectSubmission(submission.id, admin.id, 'স্ক্রিনশট অস্পষ্ট')

    expect(await prisma.transaction.count()).toBe(0)
    expect(await prisma.duePayment.count()).toBe(0)
  })
})
