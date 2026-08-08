'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toBnDigits } from '@/lib/money'

export function GenerateDuesButton({ month, year }: { month: number; year: number }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  return (
    <span className="flex items-center gap-2">
      {message && <span className="text-xs text-muted">{message}</span>}
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={async () => {
          setPending(true)
          setMessage(null)
          try {
            const response = await fetch('/api/admin/due-payments/generate', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ month, year }),
            })
            const result = await response.json()
            setMessage(
              response.ok
                ? `${toBnDigits(result.created)}টি নতুন, ${toBnDigits(result.skipped)}টি আগে থেকেই ছিল`
                : (result?.error?.messageBn ?? 'তৈরি করা যায়নি'),
            )
            router.refresh()
          } finally {
            setPending(false)
          }
        }}
      >
        {pending ? 'তৈরি হচ্ছে…' : 'হিসাব তৈরি করুন'}
      </Button>
    </span>
  )
}
