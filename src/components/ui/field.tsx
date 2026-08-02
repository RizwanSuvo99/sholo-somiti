'use client'

import {
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'

const CONTROL =
  'w-full rounded-xl border border-line bg-panel px-3.5 py-2.5 text-ink shadow-sm transition ' +
  'placeholder:text-muted/70 focus:border-brand focus:ring-4 focus:ring-brand-ring/40 focus:outline-none ' +
  'disabled:bg-surface disabled:text-muted'

/**
 * A labelled form control.
 *
 * The hint and error sit *outside* the `<label>` and are linked with
 * `aria-describedby`. Nesting them inside the label instead would splice their
 * text into the control's accessible name, so a screen reader would announce
 * the whole hint every time the field gained focus.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  children: ReactNode
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  const describedBy = [error ? errorId : null, hint && !error ? hintId : null]
    .filter(Boolean)
    .join(' ')

  const control =
    isValidElement(children) && describedBy
      ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, {
          'aria-describedby': describedBy,
        })
      : children

  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-ink">
          {label}
          {required && <span className="text-danger"> *</span>}
        </span>
        {control}
      </label>

      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function Input({
  className,
  invalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, invalid && 'border-danger focus:ring-danger/20', className)}
    />
  )
}

export function Select({
  className,
  invalid,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      {...props}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, invalid && 'border-danger focus:ring-danger/20', className)}
    />
  )
}

export function Textarea({
  className,
  invalid,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      {...props}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, invalid && 'border-danger focus:ring-danger/20', className)}
    />
  )
}
