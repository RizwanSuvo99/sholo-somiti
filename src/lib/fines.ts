/**
 * Late-payment fines and how a received amount is split.
 *
 * The fine is a flat, one-time ৳200 per missed deadline — never daily, never
 * compounding, and never charged twice for the same month.
 */

import {
  type CivilDate,
  type DueMonth,
  deadlineCivilDate,
  isBeforeWindow,
  ordinal,
} from './due-cycle'

/** ৳200, in paisa. */
export const FINE_PAISA = 20_000

export type SettlementStatus = 'PAID_ON_TIME' | 'PAID_LATE'

/**
 * Was this payment late for the month it is being applied to?
 *
 * Judged on the date the member *sent* the money, never on the date an admin got
 * around to reviewing it — a slow review must not cost a member ৳200.
 */
export function isLate(sendingDate: CivilDate, dm: DueMonth): boolean {
  return ordinal(sendingDate) > ordinal(deadlineCivilDate(dm))
}

export function settlementStatus(sendingDate: CivilDate, dm: DueMonth): SettlementStatus {
  return isLate(sendingDate, dm) ? 'PAID_LATE' : 'PAID_ON_TIME'
}

/**
 * Was the money sent before this month's window even opened? Paying April's due
 * on the 3rd of March is almost always a mis-selected month, so the form rejects
 * it rather than silently recording it.
 */
export function isTooEarly(sendingDate: CivilDate, dm: DueMonth): boolean {
  return isBeforeWindow(sendingDate, dm)
}

/**
 * The fine owed for a month.
 *
 * `alreadyChargedPaisa` is what the ledger already holds for this month — the
 * rollover job may have levied the fine before the member paid. Returning it
 * unchanged is what keeps the fine one-time: charging again here would double it.
 */
export function fineFor(
  sendingDate: CivilDate,
  dm: DueMonth,
  alreadyChargedPaisa = 0,
): number {
  if (alreadyChargedPaisa > 0) return alreadyChargedPaisa
  return isLate(sendingDate, dm) ? FINE_PAISA : 0
}

export type Allocation = {
  /** Applied to the month's subscription. */
  toDue: number
  /** Applied to the fine. */
  toFine: number
  /** Left over — booked as other income. */
  surplus: number
  /** Still owed on the due after this payment. */
  shortfall: number
}

/**
 * Split a received amount: subscription first, then the fine, and anything left
 * over is surplus.
 *
 * Due-first matters. A member who is short by exactly the fine has paid their
 * subscription and still owes the fine, rather than the reverse — which is what
 * they intended, and what keeps the subscription ledger readable.
 */
export function allocate(paidPaisa: number, duePaisa: number, finePaisa: number): Allocation {
  const toDue = Math.min(paidPaisa, duePaisa)
  const afterDue = paidPaisa - toDue
  const toFine = Math.min(afterDue, finePaisa)
  const surplus = afterDue - toFine

  return {
    toDue,
    toFine,
    surplus,
    shortfall: duePaisa - toDue + (finePaisa - toFine),
  }
}
