import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * A colour-coded figure tile.
 *
 * Each tone is written out as complete class strings rather than composed from
 * fragments, because Tailwind scans the source for literal class names and would
 * not emit `from-${tone}-50`.
 */
export type Tone = 'emerald' | 'sky' | 'amber' | 'violet' | 'rose' | 'indigo' | 'slate'

const TONES: Record<Tone, { shell: string; badge: string; value: string; label: string }> = {
  emerald: {
    shell:
      'border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-teal-100/70 ' +
      'dark:border-emerald-400/25 dark:from-emerald-500/12 dark:to-teal-500/8',
    badge: 'bg-emerald-600 text-white shadow-emerald-600/25',
    value: 'text-emerald-900 dark:text-emerald-200',
    label: 'text-emerald-800/80 dark:text-emerald-300/85',
  },
  sky: {
    shell:
      'border-sky-200/70 bg-gradient-to-br from-sky-50 to-cyan-100/70 ' +
      'dark:border-sky-400/25 dark:from-sky-500/12 dark:to-cyan-500/8',
    badge: 'bg-sky-600 text-white shadow-sky-600/25',
    value: 'text-sky-900 dark:text-sky-200',
    label: 'text-sky-800/80 dark:text-sky-300/85',
  },
  amber: {
    shell:
      'border-amber-200/70 bg-gradient-to-br from-amber-50 to-orange-100/70 ' +
      'dark:border-amber-400/25 dark:from-amber-500/12 dark:to-orange-500/8',
    badge: 'bg-amber-500 text-white shadow-amber-500/25',
    value: 'text-amber-900 dark:text-amber-200',
    label: 'text-amber-800/80 dark:text-amber-300/85',
  },
  violet: {
    shell:
      'border-violet-200/70 bg-gradient-to-br from-violet-50 to-fuchsia-100/60 ' +
      'dark:border-violet-400/25 dark:from-violet-500/12 dark:to-fuchsia-500/8',
    badge: 'bg-violet-600 text-white shadow-violet-600/25',
    value: 'text-violet-900 dark:text-violet-200',
    label: 'text-violet-800/80 dark:text-violet-300/85',
  },
  rose: {
    shell:
      'border-rose-200/70 bg-gradient-to-br from-rose-50 to-pink-100/70 ' +
      'dark:border-rose-400/25 dark:from-rose-500/12 dark:to-pink-500/8',
    badge: 'bg-rose-600 text-white shadow-rose-600/25',
    value: 'text-rose-900 dark:text-rose-200',
    label: 'text-rose-800/80 dark:text-rose-300/85',
  },
  indigo: {
    shell:
      'border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-blue-100/70 ' +
      'dark:border-indigo-400/25 dark:from-indigo-500/12 dark:to-blue-500/8',
    badge: 'bg-indigo-600 text-white shadow-indigo-600/25',
    value: 'text-indigo-900 dark:text-indigo-200',
    label: 'text-indigo-800/80 dark:text-indigo-300/85',
  },
  slate: {
    shell: 'border-line bg-panel',
    badge: 'bg-slate-700 text-white shadow-slate-700/20',
    value: 'text-ink',
    label: 'text-muted',
  },
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'slate',
  size = 'md',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: Tone
  size?: 'md' | 'lg'
}) {
  const palette = TONES[tone]

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border p-5 shadow-tile',
        palette.shell,
      )}
    >
      {/* A soft highlight in the corner, so flat fills do not read as blocks. */}
      <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-white/40 blur-2xl dark:bg-white/5" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('text-sm font-medium', palette.label)}>{label}</p>
          <p
            className={cn(
              'mt-1.5 font-bold tracking-tight tabular',
              palette.value,
              size === 'lg' ? 'text-4xl' : 'text-2xl',
            )}
          >
            {value}
          </p>
        </div>

        {icon && (
          <span
            className={cn(
              'grid size-10 shrink-0 place-items-center rounded-xl shadow-lg',
              palette.badge,
            )}
          >
            <span className="block size-5">{icon}</span>
          </span>
        )}
      </div>

      {/* Full tile width, not the column beside the icon: the hint carries a
          figure, and squeezed into ~140px it wrapped onto a second line and
          stretched every tile in the row. */}
      {hint && <p className={cn('relative mt-1.5 text-sm', palette.label)}>{hint}</p>}
    </div>
  )
}

/**
 * A hint that carries a figure of its own — a paid fine under an outstanding
 * one, say. The wording stays quiet while the amount is set at the body size,
 * because a number small enough to squint at is a number nobody reads.
 */
export function StatHint({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      {label} <span className="tabular text-base font-semibold">{value}</span>
    </>
  )
}
