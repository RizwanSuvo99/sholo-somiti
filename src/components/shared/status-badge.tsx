import { cn } from '@/lib/cn'
import { DUE_STATUS_BN, SUBMISSION_STATUS_BN } from '@/lib/bn'

const TONE: Record<string, { chip: string; dot: string }> = {
  PENDING: { chip: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/12 dark:text-amber-300 dark:ring-amber-400/25', dot: 'bg-amber-500' },
  PAID_ON_TIME: { chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/12 dark:text-emerald-300 dark:ring-emerald-400/25', dot: 'bg-emerald-500' },
  PAID_LATE: { chip: 'bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-500/12 dark:text-orange-300 dark:ring-orange-400/25', dot: 'bg-orange-500' },
  UNPAID: { chip: 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-500/12 dark:text-rose-300 dark:ring-rose-400/25', dot: 'bg-rose-500' },
  APPROVED: { chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/12 dark:text-emerald-300 dark:ring-emerald-400/25', dot: 'bg-emerald-500' },
  REJECTED: { chip: 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-500/12 dark:text-rose-300 dark:ring-rose-400/25', dot: 'bg-rose-500' },
}

const FALLBACK = { chip: 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-500/12 dark:text-slate-300 dark:ring-slate-400/25', dot: 'bg-slate-400' }

export function StatusBadge({
  status,
  kind = 'due',
  className,
}: {
  status: string
  /**
   * PENDING means two different things. On a due payment it is "বাকি" — still
   * owed. On a submission it is "অপেক্ষমাণ" — waiting for a reviewer, which is
   * not the same as unpaid and must not read as though it were.
   */
  kind?: 'due' | 'submission'
  className?: string
}) {
  const label =
    kind === 'submission'
      ? (SUBMISSION_STATUS_BN[status] ?? DUE_STATUS_BN[status] ?? status)
      : (DUE_STATUS_BN[status] ?? SUBMISSION_STATUS_BN[status] ?? status)
  const tone = TONE[status] ?? FALLBACK

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        tone.chip,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', tone.dot)} />
      {label}
    </span>
  )
}
