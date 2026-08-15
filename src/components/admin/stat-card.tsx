import type { ReactNode } from 'react'
import { StatTile, type Tone } from '@/components/public/stat-tile'

/**
 * The admin dashboard uses the same tile as the public pages, so a figure looks
 * the same wherever it appears.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'slate',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: Tone
}) {
  return <StatTile label={label} value={value} hint={hint} icon={icon} tone={tone} />
}
