import 'server-only'
import { prisma } from '@/lib/prisma'
import {
  civilToDbDate,
  compareCivilDate,
  compareDueMonth,
  currentDueMonth,
  dbDateToCivil,
  dueMonthKey,
  dueMonthsBetween,
  dueWindow,
  type CivilDate,
  type DueMonth,
} from '@/lib/due-cycle'
import { dueMonthLabel } from '@/lib/bn'
import { AppError, conflict, notFound } from '@/lib/api/errors'
import { COLLECTION_START } from '@/lib/society'

/**
 * Backfilling last year's records.
 *
 * Both modes write through a HistoricalImport batch and tag every row they
 * create with its id, so an admin can see exactly what a run touched — and so a
 * mistaken batch can be identified and reversed.
 */

/**
 * Reject a month the society never collected for.
 *
 * The pickers already hide these, but this endpoint is reachable directly and a
 * backdated row in the ledger is not something to discover months later.
 */
function assertImportableMonth(dm: DueMonth, now = new Date()): void {
  if (compareDueMonth(dm, COLLECTION_START) < 0) {
    throw new AppError(
      'VALIDATION_FAILED',
      422,
      'Month precedes the first collection month',
      `${dueMonthLabel(COLLECTION_START)} থেকে সমিতির হিসাব শুরু — এর আগের মাস যোগ করা যাবে না`,
    )
  }

  const current = currentDueMonth(now)
  if (compareDueMonth(dm, current) > 0) {
    throw new AppError(
      'VALIDATION_FAILED',
      422,
      'Month is in the future',
      'ভবিষ্যতের মাসের হিসাব যোগ করা যাবে না',
    )
  }
}

/** Mode 1: a fine for one member, for one past month. */
export async function importMemberFine(
  input: { memberCode: string; month: number; year: number; amountPaisa: number; note?: string },
  adminId: string,
) {
  const dm: DueMonth = { dueYear: input.year, dueMonth: input.month }
  assertImportableMonth(dm)

  const member = await prisma.member.findUnique({
    where: { memberCode: input.memberCode },
    select: { id: true, memberCode: true, name: true },
  })
  if (!member) throw notFound('Member', 'সদস্য')
  const entryDate = civilToDbDate(dueWindow(dm).endCivil)

  return prisma.$transaction(async (tx) => {
    const batch = await tx.historicalImport.create({
      data: {
        kind: 'FINE_IMPORT',
        description:
          input.note ?? `${member.memberCode} — ${dueMonthLabel(dm)} মাসের জরিমানা (পুরোনো হিসাব)`,
        month: input.month,
        year: input.year,
        amountPaisa: input.amountPaisa,
        affectedCount: 1,
        performedById: adminId,
      },
    })

    // The fine is recorded as received money, because a historical import is a
    // record of what was actually collected.
    await tx.transaction.create({
      data: {
        type: 'INCOME',
        incomeCategory: 'FINE',
        amountPaisa: input.amountPaisa,
        memberId: member.id,
        importBatchId: batch.id,
        note: batch.description,
        entryDate,
        createdById: adminId,
        idempotencyKey: `import:${batch.id}:${member.id}:fine`,
      },
    })

    // Keep the member's month-by-month view consistent with the ledger, if a
    // row for that month exists.
    const existing = await tx.duePayment.findUnique({
      where: { memberId_year_month: { memberId: member.id, year: input.year, month: input.month } },
      select: { id: true, finePaisa: true, finePaidPaisa: true },
    })

    if (existing) {
      await tx.duePayment.update({
        where: { id: existing.id },
        data: {
          finePaisa: Math.max(existing.finePaisa, input.amountPaisa),
          finePaidPaisa: existing.finePaidPaisa + input.amountPaisa,
          importBatchId: batch.id,
        },
      })
    }

    return { batchId: batch.id, member, affected: 1 }
  })
}

/**
 * Mode 2: one amount applied to every active member for a past month, in a
 * single action rather than 28 repetitions.
 */
export async function importUniformDue(
  input: { month: number; year: number; amountPaisa: number; note?: string },
  adminId: string,
) {
  const dm: DueMonth = { dueYear: input.year, dueMonth: input.month }
  assertImportableMonth(dm)

  // One uniform import per month. Running it twice would not double the ledger
  // (the idempotency keys prevent that), but it would silently overwrite the
  // amount on every member's row, so it is refused outright.
  const already = await prisma.historicalImport.findFirst({
    where: { kind: 'UNIFORM_DUE_IMPORT', year: input.year, month: input.month },
    select: { id: true },
  })
  if (already) {
    throw conflict(
      'CONFLICT',
      'This month has already been imported',
      `${dueMonthLabel(dm)} মাসের চাঁদা ইতিমধ্যে যোগ করা হয়েছে`,
    )
  }

  const windowEnd = civilToDbDate(dueWindow(dm).endCivil)
  const windowStart = civilToDbDate(dueWindow(dm).startCivil)

  return prisma.$transaction(async (tx) => {
    const members = await tx.member.findMany({
      where: { isActive: true, joinedOn: { lte: windowStart } },
      select: { id: true },
    })

    const batch = await tx.historicalImport.create({
      data: {
        kind: 'UNIFORM_DUE_IMPORT',
        description: input.note ?? `${dueMonthLabel(dm)} মাসের চাঁদা (পুরোনো হিসাব)`,
        month: input.month,
        year: input.year,
        amountPaisa: input.amountPaisa,
        affectedCount: members.length,
        performedById: adminId,
      },
    })

    for (const member of members) {
      await tx.duePayment.upsert({
        where: {
          memberId_year_month: { memberId: member.id, year: input.year, month: input.month },
        },
        create: {
          memberId: member.id,
          year: input.year,
          month: input.month,
          amountDuePaisa: input.amountPaisa,
          amountPaidPaisa: input.amountPaisa,
          paidAt: windowEnd,
          status: 'PAID_ON_TIME',
          importBatchId: batch.id,
        },
        update: {
          amountDuePaisa: input.amountPaisa,
          amountPaidPaisa: input.amountPaisa,
          paidAt: windowEnd,
          status: 'PAID_ON_TIME',
          importBatchId: batch.id,
        },
      })
    }

    // One ledger row per member, each with a deterministic key so re-importing
    // the same batch cannot double the income.
    await tx.transaction.createMany({
      skipDuplicates: true,
      data: members.map((member) => ({
        type: 'INCOME' as const,
        incomeCategory: 'MONTHLY_DUE' as const,
        amountPaisa: input.amountPaisa,
        memberId: member.id,
        importBatchId: batch.id,
        note: batch.description,
        entryDate: windowEnd,
        createdById: adminId,
        idempotencyKey: `import:${batch.id}:${member.id}:due`,
      })),
    })

    return { batchId: batch.id, affected: members.length }
  })
}

/** One month in a backfill, and what the tool intends to do with it. */
export type BackfillMonthPlan = {
  dueYear: number
  dueMonth: number
  label: string
  amountPaisa: number
  /**
   * `WILL_ADD` is written; `ALREADY_PAID` is left untouched, because a backfill
   * must never overwrite money that is already recorded; `UNPRICED` means the
   * society never set an amount for that month, so there is nothing to charge.
   */
  outcome: 'WILL_ADD' | 'ALREADY_PAID' | 'UNPRICED'
}

export type MemberBackfillPlan = {
  member: { memberCode: string; name: string; photoUrl: string | null; joinedOn: CivilDate }
  months: BackfillMonthPlan[]
  totalPaisa: number
  addCount: number
  alreadyPaidCount: number
  unpricedCount: number
  /** Where the joining date would move to, or null if it already covers the range. */
  joinedOnWouldBecome: CivilDate | null
}

/**
 * What a month cost, for a member who was not there to be charged at the time.
 *
 * Three sources, most authoritative first: the amount the admin set for that
 * month, the uniform import that billed everyone else, and failing both, the
 * largest amount actually charged to another member. The third is a fallback
 * rather than a guess — if twenty-nine people were billed ৳2,000 for November
 * 2025, that is what November 2025 cost, whatever paperwork recorded it.
 *
 * A month none of the three can answer for is left unpriced, and the backfill
 * refuses it. That is the same rule the public payment form enforces: nobody
 * pays a month the society never put a price on.
 */
async function amountsForMonths(months: DueMonth[]): Promise<Map<string, number>> {
  const found = new Map<string, number>()
  if (months.length === 0) return found

  const where = { OR: months.map((m) => ({ year: m.dueYear, month: m.dueMonth })) }

  const [settings, uniforms, charged] = await Promise.all([
    prisma.monthlyDueSetting.findMany({
      where,
      select: { year: true, month: true, amountPaisa: true },
    }),
    prisma.historicalImport.findMany({
      where: { kind: 'UNIFORM_DUE_IMPORT', ...where },
      select: { year: true, month: true, amountPaisa: true },
    }),
    prisma.duePayment.groupBy({
      by: ['year', 'month'],
      where,
      _max: { amountDuePaisa: true },
    }),
  ])

  // Written weakest-first so a stronger source overwrites a weaker one.
  for (const row of charged) {
    const amount = row._max.amountDuePaisa ?? 0
    if (amount > 0) found.set(dueMonthKey({ dueYear: row.year, dueMonth: row.month }), amount)
  }
  for (const row of uniforms) {
    if (row.year == null || row.month == null || !row.amountPaisa) continue
    found.set(dueMonthKey({ dueYear: row.year, dueMonth: row.month }), row.amountPaisa)
  }
  for (const row of settings) {
    if (row.amountPaisa > 0) {
      found.set(dueMonthKey({ dueYear: row.year, dueMonth: row.month }), row.amountPaisa)
    }
  }

  return found
}

/** The joining date a member needs for a month to be billable to them. */
function joinedOnFor(first: DueMonth): CivilDate {
  // The uniform import bills members who joined on or before the window start,
  // so aligning to exactly that keeps a backfilled member inside every future
  // run rather than one day outside it.
  return dueWindow(first).startCivil
}

/**
 * What a backfill would do, without doing it.
 *
 * The form shows this before the admin commits: every month, its amount, and
 * the total. Money going into a register is not somewhere to find out
 * afterwards that a month was priced differently than expected.
 */
export async function planMemberDueBackfill(
  input: { memberCode: string; from: DueMonth; to: DueMonth },
  now = new Date(),
): Promise<MemberBackfillPlan> {
  assertImportableMonth(input.from, now)
  assertImportableMonth(input.to, now)

  if (compareDueMonth(input.from, input.to) > 0) {
    throw new AppError(
      'VALIDATION_FAILED',
      422,
      'Range runs backwards',
      'শুরুর মাস শেষের মাসের পরে হতে পারে না',
    )
  }

  const member = await prisma.member.findUnique({
    where: { memberCode: input.memberCode },
    select: { id: true, memberCode: true, name: true, photoUrl: true, joinedOn: true },
  })
  if (!member) throw notFound('Member', 'সদস্য')

  const range = dueMonthsBetween(input.from, input.to)
  const [prices, settled] = await Promise.all([
    amountsForMonths(range),
    prisma.duePayment.findMany({
      where: {
        memberId: member.id,
        OR: range.map((m) => ({ year: m.dueYear, month: m.dueMonth })),
      },
      select: { year: true, month: true, status: true, amountPaidPaisa: true },
    }),
  ])

  const paidKeys = new Set(
    settled
      .filter((row) => row.status === 'PAID_ON_TIME' || row.status === 'PAID_LATE')
      .map((row) => dueMonthKey({ dueYear: row.year, dueMonth: row.month })),
  )

  const months: BackfillMonthPlan[] = range.map((dm) => {
    const key = dueMonthKey(dm)
    const amountPaisa = prices.get(key) ?? 0
    const outcome: BackfillMonthPlan['outcome'] = paidKeys.has(key)
      ? 'ALREADY_PAID'
      : amountPaisa > 0
        ? 'WILL_ADD'
        : 'UNPRICED'
    return { dueYear: dm.dueYear, dueMonth: dm.dueMonth, label: dueMonthLabel(dm), amountPaisa, outcome }
  })

  const adding = months.filter((m) => m.outcome === 'WILL_ADD')
  const wouldBe = joinedOnFor(input.from)
  const currentJoinedOn = dbDateToCivil(member.joinedOn)

  return {
    member: {
      memberCode: member.memberCode,
      name: member.name,
      photoUrl: member.photoUrl,
      joinedOn: currentJoinedOn,
    },
    months,
    totalPaisa: adding.reduce((sum, m) => sum + m.amountPaisa, 0),
    addCount: adding.length,
    alreadyPaidCount: months.filter((m) => m.outcome === 'ALREADY_PAID').length,
    unpricedCount: months.filter((m) => m.outcome === 'UNPRICED').length,
    joinedOnWouldBecome: compareCivilDate(currentJoinedOn, wouldBe) > 0 ? wouldBe : null,
  }
}

/**
 * Mode 3: every past month for one member.
 *
 * For someone who joins after the society has been running and settles the
 * whole history in one payment. `importUniformDue` cannot do this — it runs
 * once per month for everybody at once, and deliberately skips members who had
 * not joined yet — so without this the only route was hand-written SQL.
 */
export async function importMemberDueBackfill(
  input: {
    memberCode: string
    from: DueMonth
    to: DueMonth
    alignJoinedOn: boolean
    note?: string
  },
  adminId: string,
  now = new Date(),
) {
  const plan = await planMemberDueBackfill(input, now)

  if (plan.unpricedCount > 0) {
    const names = plan.months
      .filter((m) => m.outcome === 'UNPRICED')
      .map((m) => m.label)
      .join(', ')
    throw new AppError(
      'VALIDATION_FAILED',
      422,
      'Some months have no amount set',
      `${names} মাসের চাঁদার পরিমাণ নির্ধারণ করা হয়নি — আগে পরিমাণ নির্ধারণ করুন`,
    )
  }

  if (plan.addCount === 0) {
    throw conflict(
      'CONFLICT',
      'Every month in the range is already settled',
      'এই মাসগুলোর হিসাব আগেই যোগ করা আছে — নতুন করে যোগ করার কিছু নেই',
    )
  }

  const member = await prisma.member.findUniqueOrThrow({
    where: { memberCode: input.memberCode },
    select: { id: true, memberCode: true, name: true },
  })

  const adding = plan.months.filter((m) => m.outcome === 'WILL_ADD')
  const span =
    adding.length === 1
      ? adding[0]!.label
      : `${adding[0]!.label} – ${adding[adding.length - 1]!.label}`

  return prisma.$transaction(async (tx) => {
    const batch = await tx.historicalImport.create({
      data: {
        kind: 'MEMBER_DUE_BACKFILL',
        description: input.note ?? `${member.memberCode} — ${span} (পুরোনো হিসাব)`,
        // The batch spans a range, so the single month/year columns stay null
        // and the span is carried in the description instead.
        month: null,
        year: null,
        amountPaisa: plan.totalPaisa,
        affectedCount: adding.length,
        performedById: adminId,
      },
    })

    for (const month of adding) {
      const windowEnd = civilToDbDate(
        dueWindow({ dueYear: month.dueYear, dueMonth: month.dueMonth }).endCivil,
      )

      // Re-checked inside the transaction rather than trusted from the plan: a
      // payment could have been approved between the preview and the submit,
      // and overwriting a settled month would erase a real receipt.
      const existing = await tx.duePayment.findUnique({
        where: {
          memberId_year_month: {
            memberId: member.id,
            year: month.dueYear,
            month: month.dueMonth,
          },
        },
        select: { id: true, status: true },
      })
      if (existing && (existing.status === 'PAID_ON_TIME' || existing.status === 'PAID_LATE')) {
        continue
      }

      await tx.duePayment.upsert({
        where: {
          memberId_year_month: {
            memberId: member.id,
            year: month.dueYear,
            month: month.dueMonth,
          },
        },
        create: {
          memberId: member.id,
          year: month.dueYear,
          month: month.dueMonth,
          amountDuePaisa: month.amountPaisa,
          amountPaidPaisa: month.amountPaisa,
          paidAt: windowEnd,
          status: 'PAID_ON_TIME',
          importBatchId: batch.id,
        },
        update: {
          amountDuePaisa: month.amountPaisa,
          amountPaidPaisa: month.amountPaisa,
          paidAt: windowEnd,
          status: 'PAID_ON_TIME',
          importBatchId: batch.id,
        },
      })

      await tx.transaction.createMany({
        skipDuplicates: true,
        data: [
          {
            type: 'INCOME' as const,
            incomeCategory: 'MONTHLY_DUE' as const,
            amountPaisa: month.amountPaisa,
            memberId: member.id,
            importBatchId: batch.id,
            note: `${batch.description} — ${month.label}`,
            entryDate: windowEnd,
            createdById: adminId,
            // The month is part of the key because one batch covers many of
            // them; the uniform import can leave it out, since each of its
            // batches is a single month.
            idempotencyKey: `import:${batch.id}:${member.id}:${month.dueYear}-${month.dueMonth}:due`,
          },
        ],
      })
    }

    if (input.alignJoinedOn && plan.joinedOnWouldBecome) {
      await tx.member.update({
        where: { id: member.id },
        data: { joinedOn: civilToDbDate(plan.joinedOnWouldBecome) },
      })
    }

    return {
      batchId: batch.id,
      member,
      affected: adding.length,
      totalPaisa: plan.totalPaisa,
      months: adding,
      joinedOnMovedTo: input.alignJoinedOn ? plan.joinedOnWouldBecome : null,
    }
  })
}
