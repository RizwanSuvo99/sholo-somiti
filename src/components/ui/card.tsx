import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Card({
  className,
  children,
  hoverable,
}: {
  className?: string
  children: ReactNode
  hoverable?: boolean
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-line bg-panel shadow-tile',
        hoverable && 'transition duration-200 hover:-translate-y-0.5 hover:shadow-lift',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function CardHeader({
  title,
  action,
  accent,
}: {
  title: ReactNode
  action?: ReactNode
  accent?: ReactNode
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
      <h2 className="flex items-center gap-2.5 font-semibold text-ink">
        {accent}
        {title}
      </h2>
      {action}
    </header>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>
}
