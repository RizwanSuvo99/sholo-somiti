import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, resetDatabase } from '../helpers/db'
import { makeAdmin, makeDueSetting, makeMember, makeSubmission, resetFactorySequence } from '../helpers/factories'
import { recordDelayFee } from '@/lib/services/transactions'
import { approveSubmission } from '@/lib/services/submissions'
import { getMemberHistory } from '@/lib/services/members'
import { getPublicMemberProfile, getPublicMembers, getPublicSummary } from '@/lib/queries/public'
import { getDashboard } from '@/lib/queries/dashboard'
import { parseCivilDate, type DueMonth } from '@/lib/due-cycle'

const APRIL: DueMonth = { dueYear: 2026, dueMonth: 4 }
const DUE_PAISA = 200_000
const DELAY_FEE_PAISA = 50_000

/** A member who has paid one month's due, then been charged a delay fee. */
async function seed() {
  const admin = await makeAdmin()
  const member = await makeMember()
  const submission = await makeSubmission(member.id, member.memberCode, APRIL, {
    sendingDate: '2026-04-10',
    amountPaisa: DUE_PAISA,
  })
  await approveSubmission(submission.id, admin.id)

  await recordDelayFee(
    {
      memberCode: member.memberCode,
      amountPaisa: DELAY_FEE_PAISA,
      entryDate: parseCivilDate('2026-04-15'),
      note: 'দেরিতে যোগ দেওয়ার ফি',
    },
    admin.id,
  )

  return { admin, member }
}

describe('delay fee', () => {
  beforeEach(async () => {
    await resetDatabase()
    resetFactorySequence()
    await makeDueSetting(APRIL, DUE_PAISA)
  })

  it('records as received money against the member, in its own category', async () => {
    const { member } = await seed()

    const row = await prisma.transaction.findFirstOrThrow({
      where: { incomeCategory: 'DELAY_FEE' },
    })
    expect(row.type).toBe('INCOME')
    expect(row.memberId).toBe(member.id)
    expect(row.amountPaisa).toBe(DELAY_FEE_PAISA)
  })

  it('stays out of the member’s deposit total, everywhere it is shown', async () => {
    const { member } = await seed()

    // A delay fee is the society's income, not savings this member can claim.
    // If any of these three drifted, one screen would contradict another.
    const profile = await getPublicMemberProfile(member.memberCode)
    expect(profile?.totalContributedPaisa).toBe(DUE_PAISA)
    expect(profile?.delayFeePaidPaisa).toBe(DELAY_FEE_PAISA)

    const history = await getMemberHistory(member.id)
    expect(history?.totalContributedPaisa).toBe(DUE_PAISA)
    expect(history?.delayFeePaidPaisa).toBe(DELAY_FEE_PAISA)

    const [listed] = await getPublicMembers()
    expect(listed.totalContributedPaisa).toBe(DUE_PAISA)
  })

  it('never merges into the fine figures', async () => {
    const { member } = await seed()

    const profile = await getPublicMemberProfile(member.memberCode)
    expect(profile?.totalFinePaidPaisa).toBe(0)
    expect(profile?.outstandingFinePaisa).toBe(0)

    const summary = await getPublicSummary()
    expect(summary.totalFinePaisa).toBe(0)
    expect(summary.totalDelayFeePaisa).toBe(DELAY_FEE_PAISA)
  })

  it('counts towards the society’s fund', async () => {
    await seed()

    // Not the member's savings, but unquestionably the society's money.
    const summary = await getPublicSummary()
    expect(summary.totalCollectedPaisa).toBe(DUE_PAISA + DELAY_FEE_PAISA)
    expect(summary.balancePaisa).toBe(DUE_PAISA + DELAY_FEE_PAISA)

    const dashboard = await getDashboard()
    expect(dashboard.totalDelayFeesCollectedPaisa).toBe(DELAY_FEE_PAISA)
    expect(dashboard.totalDueCollectedPaisa).toBe(DUE_PAISA)
    expect(dashboard.balancePaisa).toBe(DUE_PAISA + DELAY_FEE_PAISA)
  })

  it('drops out of every total once voided', async () => {
    const { member } = await seed()
    await prisma.transaction.updateMany({
      where: { incomeCategory: 'DELAY_FEE' },
      data: { voidedAt: new Date(), voidReason: 'ভুল এন্ট্রি' },
    })

    expect((await getPublicSummary()).totalDelayFeePaisa).toBe(0)
    expect((await getDashboard()).totalDelayFeesCollectedPaisa).toBe(0)
    expect((await getPublicMemberProfile(member.memberCode))?.delayFeePaidPaisa).toBe(0)
  })

  it('refuses a member who does not exist', async () => {
    const admin = await makeAdmin()
    await expect(
      recordDelayFee(
        {
          memberCode: 'NHSS-29999',
          amountPaisa: DELAY_FEE_PAISA,
          entryDate: parseCivilDate('2026-04-15'),
        },
        admin.id,
      ),
    ).rejects.toMatchObject({ status: 404 })
  })
})
