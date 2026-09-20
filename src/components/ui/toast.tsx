'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/cn'

export type ToastTone = 'success' | 'error' | 'info'

type Toast = {
  id: number
  tone: ToastTone
  message: string
  description?: string
}

type ToastContextValue = {
  toast: (toast: Omit<Toast, 'id'>) => void
  success: (message: string, description?: string) => void
  error: (message: string, description?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** Throws rather than silently doing nothing if the provider is missing. */
export function useToast(): ToastContextValue {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside <ToastProvider>')
  return value
}

const DISMISS_AFTER_MS = 4000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback((next: Omit<Toast, 'id'>) => {
    // Date.now() can repeat within a tick, so mix in a counter.
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { ...next, id }])
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (message, description) => toast({ tone: 'success', message, description }),
      error: (message, description) => toast({ tone: 'error', message, description }),
    }),
    [toast],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

const TONES: Record<ToastTone, { shell: string; icon: string; glyph: string }> = {
  success: {
    shell:
      'border-emerald-200 bg-emerald-50 text-emerald-900 ' +
      'dark:border-emerald-400/30 dark:bg-emerald-500/12 dark:text-emerald-200',
    icon: 'bg-emerald-600 text-white',
    glyph: '✓',
  },
  error: {
    shell:
      'border-rose-200 bg-rose-50 text-rose-900 ' +
      'dark:border-rose-400/30 dark:bg-rose-500/12 dark:text-rose-200',
    icon: 'bg-rose-600 text-white',
    glyph: '!',
  },
  info: {
    shell:
      'border-sky-200 bg-sky-50 text-sky-900 ' +
      'dark:border-sky-400/30 dark:bg-sky-500/12 dark:text-sky-200',
    icon: 'bg-sky-600 text-white',
    glyph: 'i',
  },
}

function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      // `status` announces politely — a save confirmation should not interrupt
      // whatever a screen reader is currently reading.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
    >
      {toasts.map((item) => (
        <ToastItem key={item.id} toast={item} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), DISMISS_AFTER_MS)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  const tone = TONES[toast.tone]

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lift',
        tone.shell,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold', tone.icon)}
      >
        {tone.glyph}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{toast.message}</p>
        {toast.description && <p className="mt-0.5 text-xs opacity-80">{toast.description}</p>}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="বন্ধ করুন"
        className="shrink-0 rounded px-1 text-lg leading-none opacity-60 transition hover:opacity-100"
      >
        ×
      </button>
    </div>
  )
}
