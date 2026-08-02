import { formatBDT } from '@/lib/money'
import { cn } from '@/lib/cn'

/** Renders paisa as Bengali taka. Tabular figures keep money columns aligned. */
export function Money({
  paisa,
  className,
  decimals,
}: {
  paisa: number
  className?: string
  decimals?: boolean
}) {
  return <span className={cn('tabular', className)}>{formatBDT(paisa, { decimals })}</span>
}
