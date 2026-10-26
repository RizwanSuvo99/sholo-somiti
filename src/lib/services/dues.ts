import 'server-only'
import { prisma } from '@/lib/prisma'
import {
  civilToDbDate,
  currentDueMonth,
  dueWindow,
  ordinal,
  type CivilDate,
  type DueMonth,
} from '@/lib/due-cycle'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export type GenerateResult = {
  created: number
  skipped: number
  amountPaisa: number
  settingMissing: boolean
}

/**
 * Create the PENDING due rows for a month, one per eligible active member.
 *
 * Idempotent: the unique index on (member_id, year, month) plus `skipDuplicates`
 * compiles to ON CONFLICT DO NOTHING, so re-running creates nothing and — more
 * importantly — never overwrites a row that has already been paid.
 *
 * A member is billed for a cycle only if they had joined by the day the window
 * opened, so someone who joins on the 25th starts from the next cycle.
 */
export async function generateDuePayments(
  dm: DueMonth,
  client: Tx | typeof prisma = prisma,
): Promise<GenerateResult> {
  const setting = await client.monthlyDueSetting.findUnique({
    where: { year_month: { year: dm.dueYear, month: dm.dueMonth } },
    select: { amountPaisa: true },
  })

  const windowStart = civilToDbDate(dueWindow(dm).startCivil)

  const members = await client.member.findMany({
    where: { isActive: true, joinedOn: { lte: windowStart } },
    select: { id: true },
  })

  // With no setting yet, rows are still created at zero and the dashboard flags
  // it. Skipping the month instead would silently lose a month of dues.
  const amountPaisa = setting?.amountPaisa ?? 0

  const { count } = await client.duePayment.createMany({
    skipDuplicates: true,
    data: members.map((member) => ({
      memberId: member.id,
      year: dm.dueYear,
      month: dm.dueMonth,
      amountDuePaisa: amountPaisa,
      status: 'PENDING' as const,
    })),
  })

  return {
    created: count,
    skipped: members.length - count,
    amountPaisa,
    settingMissing: setting === null,
  }
}

/**
 * Bill one newly created member for the cycle that is already open.
 *
 * Due rows exist only from the moment a month is opened, so a member added
 * partway through an open month would otherwise have no row for it: never asked
 * to pay, and absent from the dashboard's paid/unpaid breakdown while still
 * counted among the active members, so the two sides stopped agreeing.
 *
 * Eligibility is the same rule `generateDuePayments` applies — billed only if
 * they had joined by the day the window opened — so backdating a joining date
 * to the society's start bills them for this month, while a genuine mid-cycle
 * joiner still starts from the next one.
 *
 * Does nothing unless the month is already open for somebody else. Opening a
 * month off the back of a member insert would bill one person for a cycle the
 * society has not started collecting.
 */
export async function billMemberForOpenMonth(
  member: { id: string; joinedOn: CivilDate },
  now: Date,
  client: Tx | typeof prisma = prisma,
): Promise<boolean> {
  const dm = currentDueMonth(now)

  if (ordinal(member.joinedOn) > ordinal(dueWindow(dm).startCivil)) return false

  const open = await client.duePayment.findFirst({
    where: { year: dm.dueYear, month: dm.dueMonth },
    select: { id: true },
  })
  if (!open) return false

  const setting = await client.monthlyDueSetting.findUnique({
    where: { year_month: { year: dm.dueYear, month: dm.dueMonth } },
    select: { amountPaisa: true },
  })

  const { count } = await client.duePayment.createMany({
    skipDuplicates: true,
    data: [
      {
        memberId: member.id,
        year: dm.dueYear,
        month: dm.dueMonth,
        amountDuePaisa: setting?.amountPaisa ?? 0,
        status: 'PENDING' as const,
      },
    ],
  })

  return count > 0
}

/**
 * Set what a month costs, and carry that price onto the rows already open for it.
 *
 * The rollover opens a row per member the moment a cycle begins, snapshotting
 * whatever the month costs at that instant — zero, if the admin has not priced
 * it yet. Without the back-fill below that zero outlives the setting: the admin
 * dues page shows ৳0, and anything reading the snapshot has to remember to fall
 * back to the setting instead. Writing the price onto the rows removes the
 * stale value rather than compensating for it everywhere it is read.
 *
 * Only rows with nothing yet collected against them are touched. A row that is
 * paid — in full or in part — keeps the figure it was billed:
 *
 *   * raising a price must not hand a member who paid in full a fresh debt for
 *     the difference, and
 *   * lowering one must not push `amountDuePaisa` under `amountPaidPaisa`,
 *     which would record somebody as having paid more than they were ever
 *     billed. A part-paid month is reachable, because one transfer can settle
 *     several months and leave the last short, so the row sits PENDING with
 *     money already against it.
 *
 * Someone part-way through paying has already been told what they owe, so their
 * bill stands either way.
 */
export async function upsertDueSetting(dm: DueMonth, amountPaisa: number, note?: string) {
  return prisma.$transaction(async (tx) => {
    const setting = await tx.monthlyDueSetting.upsert({
      where: { year_month: { year: dm.dueYear, month: dm.dueMonth } },
      update: { amountPaisa, note: note ?? null },
      create: { year: dm.dueYear, month: dm.dueMonth, amountPaisa, note: note ?? null },
    })

    await tx.duePayment.updateMany({
      where: {
        year: dm.dueYear,
        month: dm.dueMonth,
        status: { in: ['PENDING', 'UNPAID'] },
        amountPaidPaisa: 0,
      },
      data: { amountDuePaisa: amountPaisa },
    })

    return setting
  })
}
