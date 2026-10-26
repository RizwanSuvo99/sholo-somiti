'use client'

import { useState, type FormEvent } from 'react'
import { safeNextPath } from '@/lib/auth/next-path'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/alert'

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const data = new FormData(event.currentTarget)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: String(data.get('email') ?? ''),
          password: String(data.get('password') ?? ''),
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        setError(payload?.error?.messageBn ?? 'প্রবেশ করা যায়নি')
        return
      }

      // A full document load, deliberately, not router.replace().
      //
      // The router version called replace() and refresh() back to back, and
      // refresh() re-renders the *current* route — it discarded the in-flight
      // navigation and left the admin sitting on /login?next=/admin. The
      // production access log showed it plainly: a successful POST followed
      // only by an RSC refetch of /login, with no request for /admin at all.
      // On localhost the replace won the race, so it never showed up there.
      //
      // One fresh request also guarantees the new cookie is read by middleware
      // and by every server component, with no stale client router cache in
      // the way — which matters right after a deploy.
      window.location.assign(safeNextPath(nextPath))
    } catch {
      setError('সংযোগে সমস্যা হয়েছে')
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}

          <Field label="ইমেইল" required>
            <Input name="email" type="email" autoComplete="username" required autoFocus />
          </Field>

          <Field label="পাসওয়ার্ড" required>
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'অপেক্ষা করুন…' : 'প্রবেশ করুন'}
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}
