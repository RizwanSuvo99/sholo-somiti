'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { MemberAvatar } from './member-avatar'

export type MemberChoice = {
  memberCode: string
  name: string
  photoUrl?: string | null
  isActive?: boolean
}

/**
 * A member picker that shows each person's photo.
 *
 * A native `<select>` cannot do this: `<option>` renders text only, so an avatar
 * is impossible inside one. This is therefore a listbox built to the WAI-ARIA
 * pattern — trigger with `role="combobox"`, popup with `role="listbox"`, options
 * with `role="option"` — plus the keyboard behaviour people expect from a
 * select: arrows to move, Enter to choose, Escape to close, Home/End to jump.
 *
 * A hidden input carries the value, so forms that read `FormData` keep working.
 * Note that a hidden input is not covered by HTML's `required` validation, so a
 * form using this must check for an empty value itself.
 */
export function MemberSelect({
  members,
  value,
  onChange,
  name,
  label,
  hint,
  required,
  disabled,
  placeholder = '— বাছুন —',
  searchable = true,
}: {
  members: MemberChoice[]
  value: string
  onChange: (memberCode: string) => void
  name?: string
  label: string
  hint?: string
  required?: boolean
  disabled?: boolean
  placeholder?: string
  searchable?: boolean
}) {
  const baseId = useId()
  const labelId = `${baseId}-label`
  const buttonId = `${baseId}-button`
  const listId = `${baseId}-list`
  const hintId = `${baseId}-hint`

  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const selected = members.find((member) => member.memberCode === value) ?? null

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return members
    return members.filter(
      (member) =>
        member.memberCode.toLowerCase().includes(needle) ||
        member.name.toLowerCase().includes(needle),
    )
  }, [members, query])

  // Close when focus or a click leaves the widget entirely.
  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus()
  }, [open, searchable])

  function openList() {
    if (disabled) return
    const index = Math.max(0, filtered.findIndex((m) => m.memberCode === value))
    setActiveIndex(index)
    setQuery('')
    setOpen(true)
  }

  function choose(memberCode: string) {
    onChange(memberCode)
    setOpen(false)
    setQuery('')
    document.getElementById(buttonId)?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        openList()
      }
      return
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        setOpen(false)
        document.getElementById(buttonId)?.focus()
        break
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((index) => Math.min(index + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((index) => Math.max(index - 1, 0))
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(filtered.length - 1)
        break
      case 'Enter':
        event.preventDefault()
        if (filtered[activeIndex]) choose(filtered[activeIndex].memberCode)
        break
      default:
        break
    }
  }

  return (
    <div className="space-y-1.5" ref={rootRef} onKeyDown={onKeyDown}>
      <label id={labelId} htmlFor={buttonId} className="block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>

      <div className="relative">
        <button
          type="button"
          id={buttonId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-labelledby={`${labelId} ${buttonId}`}
          aria-describedby={hint ? hintId : undefined}
          aria-required={required || undefined}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-xl border border-line bg-panel px-3 py-2 text-left shadow-sm transition',
            'focus:border-brand focus:ring-4 focus:ring-brand-ring/40 focus:outline-none',
            disabled && 'cursor-not-allowed bg-surface text-muted',
          )}
        >
          {selected ? (
            <>
              <MemberAvatar
                memberCode={selected.memberCode}
                name={selected.name}
                photoUrl={selected.photoUrl}
                size={28}
              />
              <span className="min-w-0 flex-1 truncate">
                <span className="tabular font-medium">{selected.memberCode}</span>
                <span className="text-muted"> — {selected.name}</span>
                {selected.isActive === false && (
                  <span className="text-muted"> (নিষ্ক্রিয়)</span>
                )}
              </span>
            </>
          ) : (
            <>
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-white/8 dark:text-slate-500"
              >
                ?
              </span>
              <span className="min-w-0 flex-1 truncate text-muted">{placeholder}</span>
            </>
          )}

          <span aria-hidden="true" className="shrink-0 text-muted">
            ▾
          </span>
        </button>

        {/* Carries the value for forms that read FormData. */}
        {name && <input type="hidden" name={name} value={value} />}

        {open && (
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-line bg-panel shadow-lift">
            {searchable && (
              <div className="border-b border-line p-2">
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setActiveIndex(0)
                  }}
                  placeholder="নাম বা আইডি লিখে খুঁজুন"
                  aria-label="সদস্য খুঁজুন"
                  aria-controls={listId}
                  className="w-full rounded-lg border border-line px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
                />
              </div>
            )}

            <ul
              id={listId}
              role="listbox"
              aria-labelledby={labelId}
              className="max-h-64 overflow-y-auto py-1"
            >
              {filtered.length === 0 && (
                <li className="px-3 py-3 text-center text-sm text-muted">কোনো সদস্য মেলেনি</li>
              )}

              {filtered.map((member, index) => {
                const isSelected = member.memberCode === value
                return (
                  <li
                    key={member.memberCode}
                    id={`${listId}-${member.memberCode}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(member.memberCode)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm',
                      index === activeIndex && 'bg-brand-soft',
                      isSelected && 'font-medium',
                    )}
                  >
                    <MemberAvatar
                      memberCode={member.memberCode}
                      name={member.name}
                      photoUrl={member.photoUrl}
                      size={28}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="tabular">{member.memberCode}</span>
                      <span className="text-muted"> — {member.name}</span>
                      {member.isActive === false && (
                        <span className="text-muted"> (নিষ্ক্রিয়)</span>
                      )}
                    </span>
                    {isSelected && (
                      <span aria-hidden="true" className="text-brand">
                        ✓
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  )
}
