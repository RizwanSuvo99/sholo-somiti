'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'

const LINKS = [
  { href: '/admin', label: 'ড্যাশবোর্ড', exact: true, dot: 'bg-emerald-500' },
  { href: '/admin/members', label: 'সদস্য', dot: 'bg-indigo-500' },
  { href: '/admin/dues', label: 'চাঁদা', dot: 'bg-sky-500' },
  { href: '/admin/payment-submissions', label: 'জমার আবেদন', dot: 'bg-amber-500' },
  { href: '/admin/transactions', label: 'আয়-ব্যয়', dot: 'bg-rose-500' },
  { href: '/admin/import', label: 'পুরোনো তথ্য', dot: 'bg-violet-500' },
]

export function Sidebar({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname()

  return (
    <nav
      className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0"
      aria-label="প্রধান মেনু"
    >
      {LINKS.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm whitespace-nowrap transition',
              active
                ? 'bg-panel font-medium text-ink shadow-tile ring-1 ring-line'
                : 'text-muted hover:bg-panel/60 hover:text-ink',
            )}
          >
            <span className={cn('size-2 rounded-full', active ? link.dot : 'bg-slate-300')} />
            <span className="flex-1">{link.label}</span>
            {link.href === '/admin/payment-submissions' && pendingCount > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium tabular text-amber-800">
                {pendingCount}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
