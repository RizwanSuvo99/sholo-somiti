import Link from 'next/link'
import { cn } from '@/lib/cn'
import { toBnDigits } from '@/lib/money'
import { pageWindow, type PageInfo } from '@/lib/paginate'

/**
 * Server-rendered pager.
 *
 * Every control is a real link, so paging works without JavaScript and each page
 * is bookmarkable. Other query parameters (filters, tabs) are carried through,
 * which matters on pages that combine a filter with paging.
 */
export function Pagination({
  info,
  basePath,
  params = {},
  pageKey = 'page',
  label = 'সারি',
}: {
  info: PageInfo
  basePath: string
  params?: Record<string, string | string[] | undefined>
  pageKey?: string
  label?: string
}) {
  if (info.total === 0) return null

  const href = (page: number) => {
    const query = new URLSearchParams()

    for (const [key, value] of Object.entries(params)) {
      if (key === pageKey || value === undefined) continue
      query.set(key, Array.isArray(value) ? (value[0] ?? '') : value)
    }
    if (page > 1) query.set(pageKey, String(page))

    const search = query.toString()
    return search ? `${basePath}?${search}` : basePath
  }

  const { page, pageCount, from, to, total } = info

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3"
      aria-label="পাতা নির্বাচন"
    >
      <p className="text-xs text-muted">
        {toBnDigits(total)}টির মধ্যে {toBnDigits(from)}–{toBnDigits(to)} নম্বর {label}
      </p>

      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <Step href={href(page - 1)} disabled={page === 1} label="আগের পাতা">
            ‹
          </Step>

          {pageWindow(page, pageCount).map((value, index) =>
            value === null ? (
              <span key={`gap-${index}`} className="px-1.5 text-muted">
                …
              </span>
            ) : (
              <Link
                key={value}
                href={href(value)}
                aria-current={value === page ? 'page' : undefined}
                aria-label={`পাতা ${toBnDigits(value)}`}
                className={cn(
                  'min-w-8 rounded-lg px-2.5 py-1 text-center text-sm tabular transition',
                  value === page
                    ? 'bg-brand font-medium text-white shadow-sm'
                    : 'text-muted hover:bg-surface hover:text-ink',
                )}
              >
                {toBnDigits(value)}
              </Link>
            ),
          )}

          <Step href={href(page + 1)} disabled={page === pageCount} label="পরের পাতা">
            ›
          </Step>
        </div>
      )}
    </nav>
  )
}

function Step({
  href,
  disabled,
  label,
  children,
}: {
  href: string
  disabled: boolean
  label: string
  children: React.ReactNode
}) {
  const className = 'grid size-8 place-items-center rounded-lg text-lg leading-none transition'

  if (disabled) {
    return (
      <span aria-disabled="true" className={cn(className, 'text-slate-300')}>
        {children}
      </span>
    )
  }

  return (
    <Link href={href} aria-label={label} className={cn(className, 'text-muted hover:bg-surface hover:text-ink')}>
      {children}
    </Link>
  )
}
