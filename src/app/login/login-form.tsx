'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/alert'

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter()
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

      // Server Components cache per-route; refresh so the admin shell re-renders
      // with the new session rather than the logged-out version.
      router.replace(nextPath && nextPath.startsWith('/') ? nextPath : '/admin')
      router.refresh()
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
