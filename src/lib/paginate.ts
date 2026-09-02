/** Rows per page across every listing in the app. */
export const PAGE_SIZE = 10

export type PageInfo = {
  page: number
  pageSize: number
  total: number
  pageCount: number
  skip: number
  take: number
  from: number
  to: number
}

/**
 * Turn a `?page=` value into a usable page number.
 *
 * Anything unusable — missing, zero, negative, non-numeric, or past the last
 * page — clamps to a valid page rather than erroring, because a stale
 * bookmark or a hand-edited URL should still render a table.
 */
export function parsePage(raw: string | string[] | undefined, pageCount = Infinity): number {
  const value = Array.isArray(raw) ? raw[0] : raw
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.min(Math.floor(parsed), Math.max(1, pageCount))
}

export function pageCountOf(total: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

/** Everything a paged query and its pager need, derived from a raw `?page=`. */
export function paginate(
  total: number,
  rawPage: string | string[] | undefined,
  pageSize = PAGE_SIZE,
): PageInfo {
  const pageCount = pageCountOf(total, pageSize)
  const page = parsePage(rawPage, pageCount)
  const skip = (page - 1) * pageSize

  return {
    page,
    pageSize,
    total,
    pageCount,
    skip,
    take: pageSize,
    from: total === 0 ? 0 : skip + 1,
    to: Math.min(skip + pageSize, total),
  }
}

/**
 * The page numbers to show, with `null` standing in for a gap.
 * Always includes the first and last page plus a window around the current one,
 * so the control stays a fixed width however many pages there are.
 */
export function pageWindow(page: number, pageCount: number, span = 1): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)

  const pages = new Set<number>([1, pageCount])
  for (let p = page - span; p <= page + span; p += 1) {
    if (p > 1 && p < pageCount) pages.add(p)
  }

  const sorted = [...pages].sort((a, b) => a - b)
  const out: (number | null)[] = []

  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) out.push(null)
    out.push(value)
  })

  return out
}
