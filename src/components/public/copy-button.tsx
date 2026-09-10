'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'

/**
 * Copies a value to the clipboard.
 *
 * `navigator.clipboard` is unavailable on insecure origins and can be refused by
 * the browser, so a failure leaves the value on screen to be copied by hand
 * rather than reporting a success that did not happen.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  return (
    <button
      type="button"
      aria-label={`${label} কপি করুন`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setState('copied')
        } catch {
          setState('failed')
        }
        setTimeout(() => setState('idle'), 2000)
      }}
      className={cn(
        'shrink-0 rounded-lg px-2 py-1 text-xs font-medium transition',
        state === 'copied'
          ? 'bg-emerald-100 text-emerald-800'
          : state === 'failed'
            ? 'bg-rose-100 text-rose-800'
            : 'text-muted hover:bg-slate-100 hover:text-ink',
      )}
    >
      {state === 'copied' ? 'কপি হয়েছে' : state === 'failed' ? 'কপি হয়নি' : 'কপি'}
    </button>
  )
}
