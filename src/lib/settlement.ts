import { compareDueMonth, type CivilDate, type DueMonth } from './due-cycle'
import { FINE_PAISA, isLate } from './fines'

/**
 * Working out what a single payment settles.
 *
 * A member who misses a deadline owes that month's due, a ৳200 fine, and then
 * the next month's due as well — and they send it all in one transfer with one
 * transaction reference. So a payment is spread across every month it can
 * cover rather than being tied to one.
 *
 * Oldest debt first, and within a month the subscription before its fine. That
 * ordering matters: a member who is a little short should end up having paid
 * their subscription and still owing the fine, not the reverse, because the
 * subscription is what the society's accounts are built on.
 *
 * Pure on purpose — the payment form previews with it and the approval settles
 * with it, so what a member is quoted and what the ledger records come from the
 * same arithmetic.
 */

export type OutstandingMonth = {
  dueMonth: number
  dueYear: number
  /** Still owed on the subscription for this month. */
  duePaisa: number
  /** Still owed in fines for this month. */
  finePaisa: number
}

export type MonthAllocation = OutstandingMonth & {
  toDue: number
  toFine: number
  /** True when this payment clears the month's subscription outright. */
  dueSettled: boolean
}

export type SettlementPlan = {
  allocations: MonthAllocation[]
  /** Owed across all the months after this payment. */
  shortfallPaisa: number
  /** Paid over and above everything owed. */
  surplusPaisa: number
  /** Everything owed before this payment. */
  totalOwedPaisa: number
}

export function sortByMonth<T extends { dueYear: number; dueMonth: number }>(months: T[]): T[] {
  return [...months].sort((a, b) =>
    compareDueMonth(
      { dueYear: a.dueYear, dueMonth: a.dueMonth },
      { dueYear: b.dueYear, dueMonth: b.dueMonth },
    ),
  )
}

export function totalOwed(months: OutstandingMonth[]): number {
  return months.reduce((sum, month) => sum + month.duePaisa + month.finePaisa, 0)
}

/** Spread `amountPaisa` across `months`, oldest first, due before fine. */
export function planSettlement(
  months: OutstandingMonth[],
  amountPaisa: number,
): SettlementPlan {
  const ordered = sortByMonth(months)
  const owed = totalOwed(ordered)

  let remaining = Math.max(0, amountPaisa)
  const allocations: MonthAllocation[] = []

  for (const month of ordered) {
    const toDue = Math.min(remaining, month.duePaisa)
    remaining -= toDue

    const toFine = Math.min(remaining, month.finePaisa)
    remaining -= toFine

    allocations.push({
      ...month,
      toDue,
      toFine,
      // A month counts as paid once its subscription is covered. An unpaid fine
      // stays outstanding against it without holding the month open.
      dueSettled: toDue >= month.duePaisa,
    })
  }

  const applied = allocations.reduce((sum, a) => sum + a.toDue + a.toFine, 0)

  return {
    allocations,
    totalOwedPaisa: owed,
    shortfallPaisa: Math.max(0, owed - applied),
    surplusPaisa: remaining,
  }
}

/**
 * What a month costs on a given sending date.
 *
 * A fine already on the ledger is used as-is — the rollover job levies it when
 * a deadline passes, and re-deriving it could contradict what was recorded.
 * Otherwise it is derived from the date the member says they sent the money, so
 * the quote on the form matches what approval will decide.
 */
export function fineOwedFor(
  dm: DueMonth,
  sendingDate: CivilDate,
  alreadyChargedPaisa: number,
  alreadyPaidPaisa = 0,
): number {
  if (alreadyChargedPaisa > 0) return Math.max(0, alreadyChargedPaisa - alreadyPaidPaisa)
  return isLate(sendingDate, dm) ? FINE_PAISA : 0
}
