'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'

const LINKS = [
  { href: '/', label: 'হোম', exact: true },
  { href: '/members', label: 'সদস্যবৃন্দ' },
  { href: '/accounts', label: 'হিসাব' },
]

export function SiteHeader() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-20 border-b border-line/80 bg-panel/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-lg shadow-emerald-600/25">
            ষো
          </span>
          <span className="font-bold text-ink">ষোলো সমবায় সমিতি</span>
        </Link>

        <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="প্রধান মেনু">
          {LINKS.map((link) => {
            const active = link.exact ? pathname === link.href : pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-3 py-1.5 transition',
                  active ? 'bg-brand-soft font-medium text-brand' : 'text-muted hover:bg-surface hover:text-ink',
                )}
              >
                {link.label}
              </Link>
            )
          })}

          <Link
            href="/pay/submit"
            className="ml-1 rounded-xl bg-gradient-to-b from-emerald-600 to-emerald-700 px-3.5 py-1.5 font-medium text-white shadow-lg shadow-emerald-700/20 transition hover:from-emerald-500 hover:to-emerald-600"
          >
            চাঁদা জমা দিন
          </Link>
        </nav>
      </div>
    </header>
  )
}
