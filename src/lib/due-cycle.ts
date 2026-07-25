/**
 * The 21st→20th monthly due cycle, in Asia/Dhaka.
 *
 * The collection window for month M's due runs from the 21st of month (M-1) at
 * 00:00:00 through the 20th of month M at 23:59:59.999, Dhaka local time.
 *
 * ## Why this module exists
 *
 * A `Date` is an instant, not a calendar day. Asking a `Date` what day it is
 * gives a different answer depending on the machine's timezone, so a deadline of
 * "the 20th at 23:59:59" silently becomes the 20th or the 21st depending on where
 * the server runs. That class of bug misfines members.
 *
 * So the domain never passes ambiguous `Date`s around. It uses `CivilDate` —
 * a calendar day in Dhaka, with no time and no zone. `Date` appears only at two
 * boundaries (HTTP input and database I/O), and crossing those boundaries goes
 * through the converters here, which use `getUTC*`/`Date.UTC` exclusively.
 *
 * Bangladesh has observed UTC+6 with no daylight saving since 2010, so a fixed
 * offset is exact and no timezone database is needed.
 *
 * This is the only module permitted to use local-time `Date` getters; an ESLint
 * rule enforces that everywhere else.
 */

/** Asia/Dhaka is UTC+6 year-round. No DST, so this constant is exact. */
export const DHAKA_OFFSET_MIN = 360
const DHAKA_OFFSET_MS = DHAKA_OFFSET_MIN * 60 * 1000

/** The day of the month a cycle opens: the 21st of the preceding month. */
export const CYCLE_START_DAY = 21
/** The day of the month a cycle closes: the 20th. */
export const CYCLE_END_DAY = 20

/** A calendar day in Asia/Dhaka. No time, no timezone. */
export type CivilDate = { y: number; m: number; d: number }

/** The month a payment is *for*, per the cycle rule above. */
export type DueMonth = { dueYear: number; dueMonth: number }

export type DueWindow = {
  startCivil: CivilDate
  endCivil: CivilDate
  startInstant: Date
  endInstant: Date
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

export function daysInMonth(y: number, m: number): number {
  if (m < 1 || m > 12) throw new RangeError(`month out of range: ${m}`)
  return m === 2 && isLeapYear(y) ? 29 : DAYS_IN_MONTH[m - 1]
}

// ── Boundary converters ─────────────────────────────────────────────────────

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Parse a `YYYY-MM-DD` string into a CivilDate, rejecting anything that is not a
 * real calendar day. Deliberately not `new Date(s)`, which accepts garbage,
 * interprets the string as UTC, and then reports it in local time.
 */
export function parseCivilDate(input: string): CivilDate {
  const match = ISO_DATE.exec(input.trim())
  if (!match) throw new RangeError(`expected YYYY-MM-DD, got: ${input}`)

  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])

  if (m < 1 || m > 12) throw new RangeError(`month out of range: ${input}`)
  if (d < 1 || d > daysInMonth(y, m)) throw new RangeError(`day out of range: ${input}`)

  return { y, m, d }
}

/** Format a CivilDate back to `YYYY-MM-DD`. */
export function formatCivilDate(c: CivilDate): string {
  return `${String(c.y).padStart(4, '0')}-${pad2(c.m)}-${pad2(c.d)}`
}

/**
 * A CivilDate as Prisma materialises a `@db.Date` column: UTC midnight.
 * Postgres `DATE` carries no timezone, so this round-trips exactly.
 */
export function civilToDbDate(c: CivilDate): Date {
  return new Date(Date.UTC(c.y, c.m - 1, c.d))
}

/** The inverse of {@link civilToDbDate}. Reads UTC fields only. */
export function dbDateToCivil(d: Date): CivilDate {
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }
}

/** Which Dhaka calendar day an instant falls on. */
export function instantToDhakaCivil(instant: Date): CivilDate {
  const shifted = new Date(instant.getTime() + DHAKA_OFFSET_MS)
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() }
}

/** A Dhaka wall-clock time as a UTC instant. */
export function dhakaCivilToInstant(
  c: CivilDate,
  hours = 0,
  minutes = 0,
  seconds = 0,
  ms = 0,
): Date {
  return new Date(Date.UTC(c.y, c.m - 1, c.d, hours, minutes, seconds, ms) - DHAKA_OFFSET_MS)
}

// ── Ordering ────────────────────────────────────────────────────────────────

/** A totally ordered integer for a CivilDate, so comparison is arithmetic. */
export function ordinal(c: CivilDate): number {
  return c.y * 10_000 + c.m * 100 + c.d
}

export function compareCivilDate(a: CivilDate, b: CivilDate): -1 | 0 | 1 {
  const d = ordinal(a) - ordinal(b)
  return d < 0 ? -1 : d > 0 ? 1 : 0
}

export function compareDueMonth(a: DueMonth, b: DueMonth): -1 | 0 | 1 {
  const d = monthIndex(a) - monthIndex(b)
  return d < 0 ? -1 : d > 0 ? 1 : 0
}

export function dueMonthEquals(a: DueMonth, b: DueMonth): boolean {
  return a.dueYear === b.dueYear && a.dueMonth === b.dueMonth
}

// ── Month arithmetic ────────────────────────────────────────────────────────

/** Months since year 0. Makes December→January rollover fall out of the maths. */
function monthIndex(dm: DueMonth): number {
  return dm.dueYear * 12 + (dm.dueMonth - 1)
}

function fromMonthIndex(index: number): DueMonth {
  return { dueYear: Math.floor(index / 12), dueMonth: (index % 12) + 1 }
}

/** Shift a due month by `n` months. Handles year boundaries in both directions. */
export function addMonths(dm: DueMonth, n: number): DueMonth {
  return fromMonthIndex(monthIndex(dm) + n)
}

/** Inclusive list of due months from `from` to `to`. Empty if `from` is after `to`. */
export function dueMonthsBetween(from: DueMonth, to: DueMonth): DueMonth[] {
  const out: DueMonth[] = []
  for (let i = monthIndex(from); i <= monthIndex(to); i += 1) out.push(fromMonthIndex(i))
  return out
}

// ── The cycle rule ──────────────────────────────────────────────────────────

/**
 * Which month's due a payment made on `c` belongs to.
 *
 * On or before the 20th → this month's due (the window that is closing).
 * On or after the 21st  → next month's due (the window that just opened).
 */
export function dueMonthForCivilDate(c: CivilDate): DueMonth {
  const current: DueMonth = { dueYear: c.y, dueMonth: c.m }
  return c.d >= CYCLE_START_DAY ? addMonths(current, 1) : current
}

export function dueMonthForInstant(instant: Date): DueMonth {
  return dueMonthForCivilDate(instantToDhakaCivil(instant))
}

export function currentDueMonth(now: Date = new Date()): DueMonth {
  return dueMonthForInstant(now)
}

/** The collection window for a due month, as both civil days and instants. */
export function dueWindow(dm: DueMonth): DueWindow {
  const previous = addMonths(dm, -1)
  const startCivil: CivilDate = {
    y: previous.dueYear,
    m: previous.dueMonth,
    d: CYCLE_START_DAY,
  }
  const endCivil: CivilDate = { y: dm.dueYear, m: dm.dueMonth, d: CYCLE_END_DAY }

  return {
    startCivil,
    endCivil,
    startInstant: dhakaCivilToInstant(startCivil, 0, 0, 0, 0),
    endInstant: dhakaCivilToInstant(endCivil, 23, 59, 59, 999),
  }
}

/** The last instant a due month can be paid without a fine. */
export function deadlineInstant(dm: DueMonth): Date {
  return dueWindow(dm).endInstant
}

/** The last civil day a due month can be paid without a fine: the 20th. */
export function deadlineCivilDate(dm: DueMonth): CivilDate {
  return { y: dm.dueYear, m: dm.dueMonth, d: CYCLE_END_DAY }
}

export function isWithinWindow(c: CivilDate, dm: DueMonth): boolean {
  const { startCivil, endCivil } = dueWindow(dm)
  return ordinal(c) >= ordinal(startCivil) && ordinal(c) <= ordinal(endCivil)
}

/** True when `c` falls before the due month's window has opened. */
export function isBeforeWindow(c: CivilDate, dm: DueMonth): boolean {
  return ordinal(c) < ordinal(dueWindow(dm).startCivil)
}

// ── Keys and labels ─────────────────────────────────────────────────────────

/** Stable sortable key, e.g. `2026-04`. Used as the cron's period key. */
export function dueMonthKey(dm: DueMonth): string {
  return `${dm.dueYear}-${pad2(dm.dueMonth)}`
}

export function parseDueMonthKey(key: string): DueMonth {
  const match = /^(\d{4})-(\d{2})$/.exec(key)
  if (!match) throw new RangeError(`expected YYYY-MM, got: ${key}`)
  const dueMonth = Number(match[2])
  if (dueMonth < 1 || dueMonth > 12) throw new RangeError(`month out of range: ${key}`)
  return { dueYear: Number(match[1]), dueMonth }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
