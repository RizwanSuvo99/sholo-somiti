import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, resetDatabase } from '../helpers/db'
import { makeAdmin, makeDueSetting, makeMember, resetFactorySequence } from '../helpers/factories'
import { createSubmission, rejectSubmission } from '@/lib/services/submissions'
import { parseCivilDate, type DueMonth } from '@/lib/due-cycle'
import { AppError } from '@/lib/api/errors'

const APRIL: DueMonth = { dueYear: 2026, dueMonth: 4 }

function submissionInput(memberCode: string) {
  return {
    memberCode,
    name: 'সদস্য',
    sendingDate: parseCivilDate('2026-04-10'),
    amountPaisa: 50_000,
    transactionRef: 'TXN123456',
    paymentMedium: 'MOBILE_BANKING' as const,
    mobileBankingProvider: 'BKASH' as const,
    mobileBankingNumber: '01700000000',
    screenshotUrl: 'https://example.invalid/proof.jpg',
    dueMonth: APRIL.dueMonth,
    dueYear: APRIL.dueYear,
  }
}

describe('one active submission per member per due month', () => {
  beforeEach(async () => {
    await resetDatabase()
    resetFactorySequence()
    await makeDueSetting(APRIL, 50_000)
  })

  it('accepts the first submission', async () => {
    const member = await makeMember()
    const created = await createSubmission(submissionInput(member.memberCode))

    expect(created.dueMonth).toBe(4)
    expect(created.status).toBe('PENDING')
  })

  it('rejects a second submission for the same month', async () => {
    const member = await makeMember()
    await createSubmission(submissionInput(member.memberCode))

    await expect(createSubmission(submissionInput(member.memberCode))).rejects.toMatchObject({
      code: 'DUPLICATE_SUBMISSION',
    })

    expect(await prisma.paymentSubmission.count()).toBe(1)
  })

  it('lets the database hold the line when two requests race', async () => {
    // This is the test that matters: the application-level pre-check can lose a
    // race, so the partial unique index has to be what guarantees the rule.
    const member = await makeMember()

    const results = await Promise.allSettled([
      createSubmission(submissionInput(member.memberCode)),
      createSubmission(submissionInput(member.memberCode)),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(await prisma.paymentSubmission.count()).toBe(1)
  })

  it('proves the index, not the application check, is enforcing it', async () => {
    // Bypass the service entirely and insert straight through Prisma. If the
    // partial unique index were missing (e.g. after `prisma db push`), this
    // would silently succeed and the whole rule would be decorative.
    const member = await makeMember()
    await createSubmission(submissionInput(member.memberCode))

    const raw = {
      memberId: member.id,
      name: 'সদস্য',
      memberCodeSnapshot: member.memberCode,
      sendingDate: new Date(Date.UTC(2026, 3, 10)),
      amountPaisa: 50_000,
      transactionRef: 'TXNDIRECT',
      paymentMedium: 'MOBILE_BANKING' as const,
      mobileBankingProvider: 'BKASH' as const,
      mobileBankingNumber: '01700000000',
      screenshotUrl: 'https://example.invalid/proof.jpg',
      dueMonth: APRIL.dueMonth,
      dueYear: APRIL.dueYear,
    }

    await expect(prisma.paymentSubmission.create({ data: raw })).rejects.toMatchObject({
      code: 'P2002',
    })
  })

  it('frees the member to resubmit after a rejection', async () => {
    const member = await makeMember()
    const admin = await makeAdmin()

    const first = await createSubmission(submissionInput(member.memberCode))
    await rejectSubmission(first.id, admin.id, 'স্ক্রিনশট স্পষ্ট নয়')

    // REJECTED rows are excluded from the partial index, so this must succeed.
    const second = await createSubmission(submissionInput(member.memberCode))
    expect(second.status).toBe('PENDING')
    expect(await prisma.paymentSubmission.count()).toBe(2)
  })

  it('does not constrain a different member or a different month', async () => {
    const first = await makeMember()
    const second = await makeMember()

    await createSubmission(submissionInput(first.memberCode))
    await createSubmission(submissionInput(second.memberCode))

    await makeDueSetting({ dueYear: 2026, dueMonth: 3 }, 50_000)
    await createSubmission({
      ...submissionInput(first.memberCode),
      dueMonth: 3,
      dueYear: 2026,
    })

    expect(await prisma.paymentSubmission.count()).toBe(3)
  })

  it('refuses a due month that has not been reached yet', async () => {
    const member = await makeMember()

    await expect(
      createSubmission({ ...submissionInput(member.memberCode), dueMonth: 12, dueYear: 2026 }),
    ).rejects.toBeInstanceOf(AppError)
  })
})
