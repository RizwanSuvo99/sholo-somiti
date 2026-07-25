/**
 * Member codes: `NHSS-25001`.
 *
 * `NHSS` + the two-digit year the member joined + a zero-padded sequence that
 * increments continuously across years (so the first member added in 2026 after
 * 28 existing members is `NHSS-26029`, not `NHSS-26001`).
 *
 * Allocation of the sequence number is deliberately *not* here — it needs a
 * database transaction. See `allocateMemberCode` in src/lib/services/members.ts.
 */

export const MEMBER_CODE_PREFIX = 'NHSS'
export const MEMBER_CODE_SEQUENCE_WIDTH = 3

export type ParsedMemberCode = {
  prefix: string
  yearCode: number
  sequence: number
}

export function formatMemberCode(joinYear: number, sequence: number): string {
  const yy = String(joinYear % 100).padStart(2, '0')
  const seq = String(sequence).padStart(MEMBER_CODE_SEQUENCE_WIDTH, '0')
  return `${MEMBER_CODE_PREFIX}-${yy}${seq}`
}

const CODE_PATTERN = new RegExp(`^${MEMBER_CODE_PREFIX}-(\\d{2})(\\d{${MEMBER_CODE_SEQUENCE_WIDTH},})$`)

export function parseMemberCode(code: string): ParsedMemberCode | null {
  const match = CODE_PATTERN.exec(normalizeMemberCode(code))
  if (!match) return null
  return {
    prefix: MEMBER_CODE_PREFIX,
    yearCode: Number(match[1]),
    sequence: Number(match[2]),
  }
}

export function isValidMemberCode(code: string): boolean {
  return parseMemberCode(code) !== null
}

/**
 * Normalise what a member actually types on the public form.
 *
 * People type `nhss25001`, `NHSS 25001`, `nhss-25001` and paste values with
 * stray whitespace or Bengali digits. Rejecting those would be a support burden
 * for no benefit, so accept them and canonicalise instead.
 */
export function normalizeMemberCode(input: string): string {
  const latin = input.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
  const compact = latin.toUpperCase().replace(/[\s_]+/g, '').replace(/-+/g, '')

  const withoutPrefix = compact.startsWith(MEMBER_CODE_PREFIX)
    ? compact.slice(MEMBER_CODE_PREFIX.length)
    : compact

  return `${MEMBER_CODE_PREFIX}-${withoutPrefix}`
}
