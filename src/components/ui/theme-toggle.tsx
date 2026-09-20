'use client'

import { useTheme } from './theme-provider'
import { cn } from '@/lib/cn'

/**
 * Switches between the light and dark themes.
 *
 * Both icons are always rendered and CSS decides which shows. Choosing in
 * JavaScript would mean the server renders one and the browser another, giving
 * a hydration mismatch on every load — and the button would show the wrong icon
 * until React caught up.
 *
 * The label stays constant for the same reason; the icon carries the state.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="আলো ও অন্ধকার থিম বদলান"
      title="আলো ও অন্ধকার থিম বদলান"
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-panel text-muted shadow-sm transition',
        'hover:border-brand-ring hover:text-ink',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        className,
      )}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </button>
  )
}

function Sun({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function Moon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  )
}
