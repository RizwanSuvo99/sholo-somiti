'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Runs the same month-rollover code path the cron job uses, so the job can be
 * exercised and observed without waiting for a real month boundary.
 */
export function RunRolloverButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-3">
      {message && <span className="text-sm text-muted">{message}</span>}
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={async () => {
          setPending(true)
          setMessage(null)
          try {
            const response = await fetch('/api/cron/month-rollover', { method: 'POST' })
            const payload = await response.json().catch(() => null)
            setMessage(
              response.ok
                ? (payload?.summaryBn ?? 'সম্পন্ন')
                : (payload?.error?.messageBn ?? 'চালানো যায়নি'),
            )
            router.refresh()
          } finally {
            setPending(false)
          }
        }}
      >
        {pending ? 'চলছে…' : 'মাস শেষের কাজ চালান'}
      </Button>
    </div>
  )
}
