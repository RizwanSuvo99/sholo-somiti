'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/alert'

export function ReviewCard({
  submissionId,
  late,
  alreadyPaid,
  dueMonthLabel,
}: {
  submissionId: string
  late: boolean
  alreadyPaid: boolean
  dueMonthLabel: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function send(path: string, body: unknown) {
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/submissions/${submissionId}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        setError(result?.error?.messageBn ?? 'কাজটি সম্পন্ন করা যায়নি')
        return
      }

      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-3 border-t border-line bg-surface p-5">
      {error && <Alert tone="danger">{error}</Alert>}

      {alreadyPaid ? (
        <Alert tone="warn">
          {dueMonthLabel} মাসের চাঁদা ইতিমধ্যে পরিশোধিত। অতিরিক্ত জমা হলে আয়-ব্যয় পাতায় ম্যানুয়াল
          এন্ট্রি দিন।
        </Alert>
      ) : (
        <Alert tone={late ? 'warn' : 'success'}>
          অনুমোদন করলে {dueMonthLabel} মাসের চাঁদা{' '}
          <strong>{late ? 'বিলম্বে পরিশোধিত' : 'সময়মতো পরিশোধিত'}</strong> হিসেবে যুক্ত হবে
          {late && ' এবং ৳২০০ জরিমানা প্রযোজ্য হবে'}।
        </Alert>
      )}

      {rejecting ? (
        <div className="space-y-2">
          <Input
            placeholder="প্রত্যাখ্যানের কারণ লিখুন"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted">
            প্রত্যাখ্যানের পর সদস্য এই মাসের জন্য আবার আবেদন করতে পারবেন।
          </p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={pending || reason.trim().length < 3}
              onClick={() => send('reject', { reason })}
            >
              প্রত্যাখ্যান নিশ্চিত করুন
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setRejecting(false)}>
              বাতিল
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" disabled={pending} onClick={() => send('approve', {})}>
            {pending ? 'অপেক্ষা করুন…' : 'অনুমোদন করুন'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setRejecting(true)}>
            প্রত্যাখ্যান
          </Button>
        </div>
      )}
    </div>
  )
}
