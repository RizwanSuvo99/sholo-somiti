import { toEnDigits } from './money'

/**
 * Folding a search box's contents down to something worth comparing.
 *
 * Bengali numerals become Latin because the site prints every figure in Bengali
 * while the member codes are stored in Latin — someone searching for a member
 * whose card they are looking at will quite reasonably type ২৫০১১. Spaces and
 * hyphens go from both sides, so "NHSS-25011", "nhss 25011" and "25011" all
 * find the same person, and a half-remembered "rizwan uddin" still matches.
 */
export function normalizeSearch(input: string): string {
  return toEnDigits(input).toLowerCase().replace(/[\s-]+/g, '')
}

/**
 * True when any of the fields contains the query. An empty query matches
 * everything, so a blank box is not a filter.
 */
export function matchesSearch(
  fields: readonly (string | null | undefined)[],
  query: string,
): boolean {
  const needle = normalizeSearch(query)
  if (!needle) return true
  return fields.some((field) => field != null && normalizeSearch(field).includes(needle))
}
