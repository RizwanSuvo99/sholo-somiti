import { compareDueMonth, type CivilDate, type DueMonth } from './due-cycle'
import { FINE_PAISA, isLate } from './fines'
import type { IncomeCategory } from '@/generated/prisma/enums'

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
 * The sending date decides it. A member who paid before the deadline owes
 * nothing, **even if a fine is already on the ledger**: the rollover job fires
 * at 00:05 on the 21st and fines every month still unpaid, and it cannot see a
 * submission sitting in the review queue. Someone who paid on the 18th and was
 * reviewed on the 23rd would otherwise be charged for how quickly the admin got
 * to them.
 *
 * Waiving here rather than having the job skip months with a pending submission
 * is deliberate: skipping would let anyone dodge a deadline by filing a junk
 * submission before it, and if that were later rejected no fine would ever have
 * been levied. This way the fine stands on anything rejected.
 *
 * When the payment really was late, a fine already recorded is used as-is
 * rather than re-derived, so a figure the job wrote is not contradicted.
 */
export function fineOwedFor(
  dm: DueMonth,
  sendingDate: CivilDate,
  alreadyChargedPaisa: number,
  alreadyPaidPaisa = 0,
): number {
  if (!isLate(sendingDate, dm)) return 0
  if (alreadyChargedPaisa > 0) return Math.max(0, alreadyChargedPaisa - alreadyPaidPaisa)
  return FINE_PAISA
}

/**
 * Whether an existing fine should be struck off entirely.
 *
 * Only the part not already collected is waived — money that actually came in
 * stays recorded.
 */
export function fineIsWaived(
  dm: DueMonth,
  sendingDate: CivilDate,
  alreadyChargedPaisa: number,
  alreadyPaidPaisa = 0,
): boolean {
  return !isLate(sendingDate, dm) && alreadyChargedPaisa - alreadyPaidPaisa > 0
}

/**
 * The income categories that add up to a member's মোট জমা.
 *
 * A fine is a penalty the society levied, not savings the member built up, so
 * it is excluded here and reported on its own in the জরিমানা tile. Surplus
 * over-payments are booked as OTHER_INCOME against the member and *are* their
 * own money, so those stay in.
 *
 * Shared so the public directory, the public profile and the admin profile
 * cannot drift apart on what "deposited" means.
 */
export const MEMBER_DEPOSIT_CATEGORIES: IncomeCategory[] = ['MONTHLY_DUE', 'OTHER_INCOME']
