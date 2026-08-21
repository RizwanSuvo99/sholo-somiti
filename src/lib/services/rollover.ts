import 'server-only'
import { prisma } from '@/lib/prisma'
import {
  addMonths,
  compareDueMonth,
  currentDueMonth,
  dueMonthKey,
  dueMonthsBetween,
  parseDueMonthKey,
  type DueMonth,
} from '@/lib/due-cycle'
import { FINE_PAISA } from '@/lib/fines'
import { isUniqueViolation } from '@/lib/api/errors'
import { dueMonthLabel } from '@/lib/bn'
import { generateDuePayments } from './dues'

export const ROLLOVER_JOB = 'month-rollover'

export type MonthOutcome =
  | { periodKey: string; status: 'ALREADY_RAN' }
  | {
      periodKey: string
      status: 'CLOSED'
      fined: number
      opened: number
      warnings: string[]
    }

export type RolloverResult = {
  ran: boolean
  months: MonthOutcome[]
  summaryBn: string
}

/**
 * A cap on self-healing. If the job has not run for longer than this, the gap is
 * left for an admin to reconcile by hand rather than silently generating years
 * of dues.
 */
const MAX_BACKFILL_MONTHS = 12

/**
 * Close each month whose deadline has passed and open the one after it.
 *
 * Runs daily rather than monthly so that a missed run heals itself: it works
 * through every unclosed month up to the last closed deadline instead of
 * skipping a month forever.
 *
 * Four independent things make a repeat run a no-op, any one of which would be
 * sufficient on its own:
 *   1. the JobRun unique (job, periodKey), taken as the first statement in the
 *      transaction, so a concurrent invocation cannot interleave;
 *   2. the `status = PENDING` predicate on the fine update — a second pass
 *      matches zero rows, so ৳200 can never be charged twice;
 *   3. the unique (member_id, year, month) on DuePayment with skipDuplicates;
 *   4. Transaction.idempotencyKey, for the ledger rows written elsewhere.
 */
export async function runMonthRollover(now: Date = new Date()): Promise<RolloverResult> {
  // The month whose window has closed. The month `currentDueMonth` returns is
  // still open for collection, so it is never touched — which is also why no
  // deadline check is needed here: this month's deadline has always passed.
  const justClosed = addMonths(currentDueMonth(now), -1)

  const pending = await monthsAwaitingClose(justClosed)
  const months: MonthOutcome[] = []

  for (const dm of pending) {
    months.push(await closeMonth(dm))
  }

  return { ran: true, months, summaryBn: summarise(months) }
}

/**
 * Which months still need closing, oldest first.
 *
 * On the very first run there is no history to heal, so only the month that has
 * just closed is processed. Sweeping backwards from a cold start would invent
 * due rows for months the society never collected.
 */
async function monthsAwaitingClose(justClosed: DueMonth): Promise<DueMonth[]> {
  const lastRun = await prisma.jobRun.findFirst({
    where: { job: ROLLOVER_JOB, finishedAt: { not: null } },
    orderBy: { periodKey: 'desc' },
    select: { periodKey: true },
  })

  if (!lastRun) return [justClosed]

  const earliest = addMonths(parseDueMonthKey(lastRun.periodKey), 1)
  if (compareDueMonth(earliest, justClosed) > 0) return []

  // Cap the catch-up: a very long outage is an admin problem, not something to
  // resolve by generating a year of rows unattended.
  const floor = addMonths(justClosed, -MAX_BACKFILL_MONTHS)
  const from = compareDueMonth(earliest, floor) < 0 ? floor : earliest
  return dueMonthsBetween(from, justClosed)
}

async function closeMonth(dm: DueMonth): Promise<MonthOutcome> {
  const periodKey = dueMonthKey(dm)

  try {
    return await prisma.$transaction(async (tx) => {
      // The lock. First statement, same transaction as the work, so a second
      // concurrent run fails here rather than duplicating anything.
      const run = await tx.jobRun.create({ data: { job: ROLLOVER_JOB, periodKey } })

      // Fine everyone who never paid. The status predicate is the idempotency
      // guard: after this, nothing for the month is PENDING any more.
      const fined = await tx.duePayment.updateMany({
        where: { year: dm.dueYear, month: dm.dueMonth, status: 'PENDING', finePaisa: 0 },
        data: { status: 'UNPAID', finePaisa: FINE_PAISA },
      })

      // Deliberately no FINE transaction here. A levied fine is a receivable,
      // not cash — booking it now would overstate "fines collected" on the
      // dashboard. The income row is written when the money actually arrives.

      const next = addMonths(dm, 1)
      const generated = await generateDuePayments(next, tx)

      const warnings = generated.settingMissing ? ['DUE_SETTING_MISSING'] : []

      await tx.jobRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          result: {
            fined: fined.count,
            opened: generated.created,
            openedFor: dueMonthKey(next),
            warnings,
          },
        },
      })

      return {
        periodKey,
        status: 'CLOSED' as const,
        fined: fined.count,
        opened: generated.created,
        warnings,
      }
    })
  } catch (error) {
    if (isUniqueViolation(error)) return { periodKey, status: 'ALREADY_RAN' }
    throw error
  }
}

function summarise(months: MonthOutcome[]): string {
  const closed = months.filter((m) => m.status === 'CLOSED')
  if (closed.length === 0) return 'নতুন কিছু করার ছিল না'

  const fined = closed.reduce((sum, m) => sum + (m.status === 'CLOSED' ? m.fined : 0), 0)
  const opened = closed.reduce((sum, m) => sum + (m.status === 'CLOSED' ? m.opened : 0), 0)
  const label = dueMonthLabel(parseDueMonthKey(closed[closed.length - 1].periodKey))

  return `${label} পর্যন্ত বন্ধ — ${fined} জনের জরিমানা, ${opened}টি নতুন চাঁদার হিসাব`
}
