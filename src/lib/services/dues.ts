import 'server-only'
import { prisma } from '@/lib/prisma'
import { civilToDbDate, dueWindow, type DueMonth } from '@/lib/due-cycle'

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

export async function upsertDueSetting(dm: DueMonth, amountPaisa: number, note?: string) {
  return prisma.monthlyDueSetting.upsert({
    where: { year_month: { year: dm.dueYear, month: dm.dueMonth } },
    update: { amountPaisa, note: note ?? null },
    create: { year: dm.dueYear, month: dm.dueMonth, amountPaisa, note: note ?? null },
  })
}
