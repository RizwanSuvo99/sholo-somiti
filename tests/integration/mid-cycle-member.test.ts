import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, resetDatabase } from '../helpers/db'
import { makeDueSetting, makeMember, resetFactorySequence } from '../helpers/factories'
import { createMember } from '@/lib/services/members'
import { generateDuePayments } from '@/lib/services/dues'
import { getPublicSummary } from '@/lib/queries/public'
import { dhakaCivilToInstant, parseCivilDate, type DueMonth } from '@/lib/due-cycle'

const OCTOBER: DueMonth = { dueYear: 2026, dueMonth: 10 }
const DUE_PAISA = 700_00

/** 18 October 2026 in Dhaka — inside October's window (21 Sep → 20 Oct). */
const midOctober = dhakaCivilToInstant(parseCivilDate('2026-10-18'), 10, 0)

async function octoberRowFor(memberId: string) {
  return prisma.duePayment.findUnique({
    where: { memberId_year_month: { memberId, year: 2026, month: 10 } },
  })
}

describe('a member added after the cycle has already opened', () => {
  beforeEach(async () => {
    await resetDatabase()
    resetFactorySequence()
    await makeDueSetting(OCTOBER, DUE_PAISA)
  })

  it('is billed for the open month when they had joined by the window start', async () => {
    await makeMember({ joinedOn: '2025-01-01' })
    await generateDuePayments(OCTOBER)

    const added = await createMember(
      { name: 'নতুন সদস্য', joinedOn: parseCivilDate('2025-10-01') },
      midOctober,
    )

    const row = await octoberRowFor(added.id)
    expect(row).not.toBeNull()
    expect(row?.status).toBe('PENDING')
    expect(row?.amountDuePaisa).toBe(DUE_PAISA)
  })

  it('is not billed for the open month when they joined mid-cycle', async () => {
    await makeMember({ joinedOn: '2025-01-01' })
    await generateDuePayments(OCTOBER)

    const added = await createMember(
      { name: 'মাঝপথে যোগ', joinedOn: parseCivilDate('2026-10-18') },
      midOctober,
    )

    expect(await octoberRowFor(added.id)).toBeNull()
  })

  it('opens nothing when the month has not been opened for anyone yet', async () => {
    const added = await createMember(
      { name: 'প্রথম সদস্য', joinedOn: parseCivilDate('2025-10-01') },
      midOctober,
    )

    expect(await octoberRowFor(added.id)).toBeNull()
    expect(await prisma.duePayment.count()).toBe(0)
  })

  it('leaves the dashboard breakdown adding up to the number billed', async () => {
    for (let i = 0; i < 3; i += 1) await makeMember({ joinedOn: '2025-01-01' })
    await generateDuePayments(OCTOBER)
    await createMember(
      { name: 'নতুন সদস্য', joinedOn: parseCivilDate('2025-10-01') },
      midOctober,
    )

    const summary = await getPublicSummary(midOctober)
    const { paidCount, pendingCount, unpaidCount, billedCount } = summary.currentDue
    expect(paidCount + pendingCount + unpaidCount).toBe(billedCount)
    expect(billedCount).toBe(4)
    expect(summary.activeMembers).toBe(4)
  })

  it('excludes a mid-cycle joiner from the breakdown denominator', async () => {
    for (let i = 0; i < 3; i += 1) await makeMember({ joinedOn: '2025-01-01' })
    await generateDuePayments(OCTOBER)
    await createMember({ name: 'মাঝপথে যোগ', joinedOn: parseCivilDate('2026-10-18') }, midOctober)

    const summary = await getPublicSummary(midOctober)
    expect(summary.activeMembers).toBe(4)
    expect(summary.currentDue.billedCount).toBe(3)
    expect(summary.currentDue.pendingCount).toBe(3)
  })
})
