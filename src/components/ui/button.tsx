import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-emerald-600 to-emerald-700 text-white shadow-lg shadow-emerald-700/20 ' +
    'hover:from-emerald-500 hover:to-emerald-600',
  secondary: 'bg-panel text-ink border border-line shadow-sm hover:bg-surface hover:border-brand-ring',
  danger:
    'bg-gradient-to-b from-rose-600 to-rose-700 text-white shadow-lg shadow-rose-700/20 hover:from-rose-500 hover:to-rose-600',
  ghost: 'text-brand hover:bg-brand-soft',
}

const SIZES: Record<Size, string> = {
  sm: 'px-3.5 py-1.5 text-sm',
  md: 'px-5 py-2.5',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        'active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    />
  )
}
