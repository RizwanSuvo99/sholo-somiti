/**
 * Money is stored and moved as an integer number of *paisa* (১ টাকা = ১০০ পয়সা).
 *
 * Floats cannot represent 0.1 exactly, and Prisma's `Decimal` is a decimal.js
 * instance that does not serialise cleanly from a Server Component into a Client
 * Component. A plain integer sidesteps both: it is exact under addition (all this
 * app does with money) and crosses every boundary as a JSON number.
 *
 * Taka exists only in two places: what a person types, and what a person reads.
 * `toPaisa` and `formatBDT` are those two boundaries.
 */

export const PAISA_PER_TAKA = 100

/**
 * Narrow no-break space, set between ৳ and the amount.
 *
 * The taka sign and the Bengali digits all carry the headstroke, so with no gap
 * their headstrokes join and the first digit is read as part of the symbol —
 * ৳১,২৭,০০০ looks like the ১ is missing. A narrow space separates them without
 * opening a visible gap, and being no-break it keeps the amount on one line.
 */
export const CURRENCY_GAP = '\u202F'

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'] as const
const EN_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

/** Render Latin digits as Bengali digits: `2026` → `২০২৬`. */
export function toBnDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)])
}

/** Render Bengali digits as Latin digits, so form input can be parsed. */
export function toEnDigits(input: string): string {
  return input.replace(/[০-৯]/g, (d) => EN_DIGITS[BN_DIGITS.indexOf(d as (typeof BN_DIGITS)[number])])
}

/**
 * Parse a user-entered taka amount into paisa.
 *
 * Accepts Bengali or Latin digits, thousands separators and a leading ৳, because
 * people type all of those. Rounds at this single point so rounding can never
 * happen twice.
 */
export function toPaisa(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new RangeError(`not a finite amount: ${input}`)
    return Math.round(input * PAISA_PER_TAKA)
  }

  const cleaned = toEnDigits(input).replace(/[৳,\s]/g, '').trim()
  if (cleaned === '' || !/^-?\d*\.?\d*$/.test(cleaned)) {
    throw new RangeError(`not a valid amount: ${input}`)
  }

  const taka = Number(cleaned)
  if (!Number.isFinite(taka)) throw new RangeError(`not a valid amount: ${input}`)
  return Math.round(taka * PAISA_PER_TAKA)
}

/** Paisa back to a taka number. For display and form defaults only. */
export function fromPaisa(paisa: number): number {
  return paisa / PAISA_PER_TAKA
}

export type FormatOptions = {
  /** Render digits in Bengali. Defaults to true — the UI is Bengali. */
  bnDigits?: boolean
  /** Include the ৳ sign. Defaults to true. */
  symbol?: boolean
  /** Always show two decimal places. Defaults to false (whole taka reads cleaner). */
  decimals?: boolean
}

/** Format paisa for display: `20000` → `৳২০০`. */
export function formatBDT(paisa: number, options: FormatOptions = {}): string {
  const { bnDigits = true, symbol = true, decimals = false } = options

  const negative = paisa < 0
  const abs = Math.abs(paisa)
  const whole = Math.trunc(abs / PAISA_PER_TAKA)
  const remainder = abs % PAISA_PER_TAKA

  let text = groupBengaliStyle(whole)
  if (decimals || remainder !== 0) {
    text += `.${String(remainder).padStart(2, '0')}`
  }
  if (bnDigits) text = toBnDigits(text)
  if (symbol) text = `৳${CURRENCY_GAP}${text}`
  return negative ? `-${text}` : text
}

/**
 * Group digits the South Asian way — last three, then pairs: ১২,৩৪,৫৬৭.
 * `Intl.NumberFormat('bn-BD')` does this too, but hand-rolling keeps the module
 * dependency-free and its output stable across Node ICU builds.
 */
function groupBengaliStyle(n: number): string {
  const digits = String(n)
  if (digits.length <= 3) return digits

  const head = digits.slice(0, -3)
  const tail = digits.slice(-3)
  return `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}`
}

export function sumPaisa(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}
