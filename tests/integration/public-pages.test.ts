import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, resetDatabase } from '../helpers/db'
import { makeAdmin, makeDueSetting, makeMember, makeSubmission, resetFactorySequence } from '../helpers/factories'
import { approveSubmission } from '@/lib/services/submissions'
import { createTransaction } from '@/lib/services/transactions'
import { getMemberHistory } from '@/lib/services/members'
import {
  getExpenseBreakdown,
  getMonthlyTotals,
  getPublicLedger,
  getPublicMemberProfile,
  getPublicMembers,
  getPublicSummary,
} from '@/lib/queries/public'
import { parseCivilDate, type DueMonth } from '@/lib/due-cycle'
import { FINE_PAISA } from '@/lib/fines'

const APRIL: DueMonth = { dueYear: 2026, dueMonth: 4 }
const DUE_PAISA = 50_000
const MOBILE = '01711112222'
const EMAIL = 'member@example.com'

async function seedScenario() {
  const admin = await makeAdmin()
  const member = await makeMember()

  // Contact details exist on the record; the public pages must not reveal them.
  await prisma.member.update({
    where: { id: member.id },
    data: { mobile: MOBILE, email: EMAIL, fatherName: 'গোপন পিতার নাম' },
  })

  const submission = await makeSubmission(member.id, member.memberCode, APRIL, {
    sendingDate: '2026-04-10',
  })
  await approveSubmission(submission.id, admin.id)

  await createTransaction(
    {
      type: 'EXPENSE',
      expenseCategoryText: 'ছাপার খরচ',
      expenseCategoryId: null,
      amount: 12_000,
      note: 'রসিদ বই ছাপানো',
      entryDate: parseCivilDate('2026-04-15'),
    },
    admin.id,
  )

  return { admin, member, submission }
}

describe('public transparency pages', () => {
  beforeEach(async () => {
    await resetDatabase()
    resetFactorySequence()
    await makeDueSetting(APRIL, DUE_PAISA)
  })

  it('reports the fund balance as income minus expenses', async () => {
    await seedScenario()
    const summary = await getPublicSummary()

    expect(summary.totalDuePaisa).toBe(DUE_PAISA)
    expect(summary.totalExpensePaisa).toBe(12_000)
    expect(summary.balancePaisa).toBe(DUE_PAISA - 12_000)
    expect(summary.activeMembers).toBe(1)
  })

  it('lists members with their contribution totals', async () => {
    const { member } = await seedScenario()
    const [listed] = await getPublicMembers()

    expect(listed.memberCode).toBe(member.memberCode)
    expect(listed.totalContributedPaisa).toBe(DUE_PAISA)
  })

  it('never exposes a member phone number, email or father name', async () => {
    const { member } = await seedScenario()

    const serialised = JSON.stringify([
      await getPublicMembers(),
      await getPublicMemberProfile(member.memberCode),
      (await getPublicLedger()).entries,
      await getPublicSummary(),
    ])

    expect(serialised).not.toContain(MOBILE)
    expect(serialised).not.toContain(EMAIL)
    expect(serialised).not.toContain('গোপন পিতার নাম')
  })

  it('never exposes a payment reference number', async () => {
    // Approval notes embed the member's bKash/bank reference, e.g.
    // "এপ্রিল ২০২৬ মাসের চাঁদা — TXN1234". Those are payment identifiers and
    // must not appear on a page anyone can read.
    const { member } = await seedScenario()

    const stored = await prisma.paymentSubmission.findFirstOrThrow({
      where: { memberId: member.id },
      select: { transactionRef: true },
    })

    const { entries: ledger } = await getPublicLedger()
    const serialised = JSON.stringify(ledger)

    expect(serialised).not.toContain(stored.transactionRef)
    // The row is still there, described by its category.
    expect(ledger.some((entry) => entry.description === 'মাসিক চাঁদা')).toBe(true)
  })

  it('keeps admin-written expense notes, which are the point of the page', async () => {
    await seedScenario()
    const { entries: ledger } = await getPublicLedger()

    const expense = ledger.find((entry) => entry.type === 'EXPENSE')
    expect(expense?.description).toBe('রসিদ বই ছাপানো')
  })

  it('hides deactivated members from the directory and their profile', async () => {
    const { member } = await seedScenario()
    await prisma.member.update({ where: { id: member.id }, data: { isActive: false } })

    expect(await getPublicMembers()).toHaveLength(0)
    expect(await getPublicMemberProfile(member.memberCode)).toBeNull()
  })

  it('excludes voided transactions from public totals', async () => {
    await seedScenario()
    await prisma.transaction.updateMany({
      where: { type: 'EXPENSE' },
      data: { voidedAt: new Date(), voidReason: 'ভুল এন্ট্রি' },
    })

    const summary = await getPublicSummary()
    expect(summary.totalExpensePaisa).toBe(0)
    expect(summary.balancePaisa).toBe(DUE_PAISA)

    const { entries: ledger } = await getPublicLedger()
    expect(ledger.some((entry) => entry.type === 'EXPENSE')).toBe(false)
  })

  it('shows outstanding fines separately from collected ones', async () => {
    const admin = await makeAdmin()
    const member = await makeMember()
    const submission = await makeSubmission(member.id, member.memberCode, APRIL, {
      sendingDate: '2026-05-03',
      amountPaisa: DUE_PAISA, // covers the due but not the ৳ 200 fine
    })
    await approveSubmission(submission.id, admin.id)

    const profile = await getPublicMemberProfile(member.memberCode)
    expect(profile?.outstandingFinePaisa).toBe(FINE_PAISA)
    expect(profile?.totalFinePaidPaisa).toBe(0)
  })

  it('keeps a paid fine out of the member deposit total', async () => {
    const admin = await makeAdmin()
    const member = await makeMember()
    const submission = await makeSubmission(member.id, member.memberCode, APRIL, {
      sendingDate: '2026-05-03',
      amountPaisa: DUE_PAISA + FINE_PAISA, // settles the due and the fine together
    })
    await approveSubmission(submission.id, admin.id)

    // A fine is a penalty the society levied, not savings the member built up.
    // It belongs in the জরিমানা tile alone; counting it in মোট জমা would make a
    // fined member look like they had deposited more than everyone else.
    const profile = await getPublicMemberProfile(member.memberCode)
    expect(profile?.totalContributedPaisa).toBe(DUE_PAISA)
    expect(profile?.totalFinePaidPaisa).toBe(FINE_PAISA)
    expect(profile?.outstandingFinePaisa).toBe(0)

    const [listed] = await getPublicMembers()
    expect(listed.totalContributedPaisa).toBe(DUE_PAISA)

    const history = await getMemberHistory(member.id)
    expect(history?.totalContributedPaisa).toBe(DUE_PAISA)

    // The society's own books are unaffected — the fine is still fund income.
    const summary = await getPublicSummary()
    expect(summary.totalFinePaisa).toBe(FINE_PAISA)
    expect(summary.totalCollectedPaisa).toBe(DUE_PAISA + FINE_PAISA)
  })

  it('breaks expenses down by head and totals by month', async () => {
    await seedScenario()

    const breakdown = await getExpenseBreakdown()
    expect(breakdown).toEqual([{ name: 'ছাপার খরচ', amountPaisa: 12_000 }])

    const { months } = await getMonthlyTotals()
    const april = months.find((row) => row.year === 2026 && row.month === 4)
    expect(april).toMatchObject({ incomePaisa: DUE_PAISA, expensePaisa: 12_000 })
  })

  it('pages the ledger in the database rather than truncating it', async () => {
    const admin = await makeAdmin()
    for (let i = 0; i < 12; i += 1) {
      await createTransaction(
        {
          type: 'EXPENSE',
          expenseCategoryText: 'বিবিধ',
          expenseCategoryId: null,
          amount: 100 + i,
          note: `খরচ ${i}`,
          entryDate: parseCivilDate('2026-04-15'),
        },
        admin.id,
      )
    }

    const first = await getPublicLedger(0, 10)
    const second = await getPublicLedger(10, 10)

    expect(first.total).toBe(12)
    expect(first.entries).toHaveLength(10)
    expect(second.entries).toHaveLength(2)

    // No row appears on both pages.
    const ids = new Set([...first.entries, ...second.entries].map((entry) => entry.id))
    expect(ids.size).toBe(12)
  })

  it('returns null for an unknown member code', async () => {
    expect(await getPublicMemberProfile('NHSS-99999')).toBeNull()
  })
})
