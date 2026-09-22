'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

/**
 * How many characters before a search runs.
 *
 * One character matches almost everybody, so the list would flicker through a
 * near-complete redraw on the way to a useful query. Below the threshold the
 * box behaves as though it were empty.
 */
const MIN_QUERY = 2

/** Long enough to finish a word, short enough to feel immediate. */
const DEBOUNCE_MS = 300

/**
 * Search-as-you-type over the member directory.
 *
 * The typing is client state; the filtering stays on the server. Each pause
 * replaces the URL, so results remain shareable and bookmarkable, paging keeps
 * the query, and the Back button leaves the directory rather than walking back
 * through every keystroke.
 *
 * It is still a real GET form. With JavaScript unavailable, the button and the
 * Enter key submit it the ordinary way to exactly the same URL.
 */
export function MemberSearch({ query }: { query: string }) {
  const router = useRouter()
  const [value, setValue] = useState(query)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const intended = value.trim().length >= MIN_QUERY ? value.trim() : ''

  useEffect(() => {
    // Already showing what the box asks for — including the first render, and
    // the render that arrives in response to this very navigation, which is
    // what stops the effect chasing its own tail.
    if (intended === query) return

    const timer = setTimeout(() => {
      startTransition(() => {
        router.replace(intended ? `/members?q=${encodeURIComponent(intended)}` : '/members', {
          scroll: false,
        })
      })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [intended, query, router])

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // Enter should not wait out the debounce, and must not double-navigate.
    event.preventDefault()
    startTransition(() => {
      router.replace(intended ? `/members?q=${encodeURIComponent(intended)}` : '/members', {
        scroll: false,
      })
    })
  }

  function clear() {
    setValue('')
    inputRef.current?.focus()
  }

  return (
    <form role="search" action="/members" onSubmit={onSubmit} className="mt-4">
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="নাম বা আইডি নম্বর দিয়ে খুঁজুন"
          aria-label="নাম বা আইডি নম্বর দিয়ে সদস্য খুঁজুন"
          autoComplete="off"
          className="min-w-56 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm"
        />
        <Button size="sm" variant="secondary" type="submit">
          খুঁজুন
        </Button>
        {value && (
          <Button size="sm" variant="ghost" type="button" onClick={clear}>
            মুছুন
          </Button>
        )}
      </div>

      <p aria-live="polite" className="mt-2 h-5 text-sm text-muted">
        {isPending
          ? 'খোঁজা হচ্ছে…'
          : value.trim().length > 0 && value.trim().length < MIN_QUERY
            ? 'খুঁজতে অন্তত দুটি অক্ষর লিখুন'
            : ''}
      </p>
    </form>
  )
}
