import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'info' | 'warn' | 'danger' | 'success'

// Built from the semantic tokens, so these follow the theme on their own.
const TONES: Record<Tone, string> = {
  info: 'border-info/30 bg-info/5 text-info dark:bg-info/10',
  warn: 'border-warn/30 bg-warn/5 text-warn dark:bg-warn/10',
  danger: 'border-danger/30 bg-danger-soft text-danger',
  success: 'border-positive/30 bg-positive/5 text-positive dark:bg-positive/10',
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border px-4 py-3 text-sm', TONES[tone], className)} role="status">
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title ? 'mt-1' : null)}>{children}</div>}
    </div>
  )
}
