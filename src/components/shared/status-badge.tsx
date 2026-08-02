import { cn } from '@/lib/cn'
import { DUE_STATUS_BN, SUBMISSION_STATUS_BN } from '@/lib/bn'

const TONE: Record<string, { chip: string; dot: string }> = {
  PENDING: { chip: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  PAID_ON_TIME: { chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' },
  PAID_LATE: { chip: 'bg-orange-50 text-orange-800 ring-orange-200', dot: 'bg-orange-500' },
  UNPAID: { chip: 'bg-rose-50 text-rose-800 ring-rose-200', dot: 'bg-rose-500' },
  APPROVED: { chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' },
  REJECTED: { chip: 'bg-rose-50 text-rose-800 ring-rose-200', dot: 'bg-rose-500' },
}

const FALLBACK = { chip: 'bg-slate-50 text-slate-700 ring-slate-200', dot: 'bg-slate-400' }

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const label = DUE_STATUS_BN[status] ?? SUBMISSION_STATUS_BN[status] ?? status
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
