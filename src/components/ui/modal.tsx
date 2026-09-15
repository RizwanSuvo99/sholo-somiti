'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './button'

/**
 * An accessible modal dialog.
 *
 * Hand-rolled rather than using the native `<dialog>` element: `showModal()` is
 * only partially implemented in jsdom, which would leave these dialogs untested.
 * The behaviour a modal must get right is implemented explicitly — focus moves
 * in on open and returns to the trigger on close, Tab is trapped inside, Escape
 * and a backdrop click both dismiss, and the page behind cannot be scrolled.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const baseId = useId()
  const titleId = `${baseId}-title`
  const descriptionId = `${baseId}-description`

  useEffect(() => {
    if (!open) return

    restoreFocusRef.current = document.activeElement as HTMLElement | null

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    // Focus the first control inside, falling back to the panel itself.
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    ;(focusable?.[0] ?? panelRef.current)?.focus()

    return () => {
      document.body.style.overflow = overflow
      restoreFocusRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key !== 'Tab') return

    const focusable = [
      ...(panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ]
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center p-4 sm:items-center">
      <div
        // Decorative backdrop: dismissing is also possible with Escape and the
        // cancel button, so this does not need to be reachable on its own.
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          'relative w-full overflow-hidden rounded-2xl border border-line bg-panel shadow-lift',
          size === 'sm' ? 'max-w-sm' : 'max-w-lg',
        )}
      >
        <header className="border-b border-line px-5 py-4">
          <h2 id={titleId} className="font-semibold text-ink">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1 text-sm text-muted">
              {description}
            </p>
          )}
        </header>

        {children && <div className="max-h-[60vh] overflow-y-auto p-5">{children}</div>}

        {footer && (
          <footer className="flex justify-end gap-2 border-t border-line bg-surface px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

/**
 * A modal that asks before doing something destructive or hard to reverse.
 */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel = 'বাতিল',
  tone = 'danger',
  pending,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  pending?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant={tone} size="sm" onClick={onConfirm} disabled={pending}>
            {pending ? 'অপেক্ষা করুন…' : confirmLabel}
          </Button>
        </>
      }
    />
  )
}
