'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/alert'
import { Money } from '@/components/shared/money'

type SettlementPlan = {
  months: {
    dueMonth: number
    dueYear: number
    label: string
    toDue: number
    toFine: number
    dueSettled: boolean
    late: boolean
    fineWaivedPaisa: number
  }[]
  totalOwedPaisa: number
  shortfallPaisa: number
  surplusPaisa: number
}

export function ReviewCard({
  submissionId,
  plan,
  dueMonthLabel,
}: {
  submissionId: string
  plan: SettlementPlan | null
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

      {!plan || plan.months.length === 0 ? (
        <Alert tone="warn">
          {dueMonthLabel} মাস পর্যন্ত সব চাঁদা ইতিমধ্যে পরিশোধিত। অতিরিক্ত জমা হলে আয়-ব্যয় পাতায়
          ম্যানুয়াল এন্ট্রি দিন।
        </Alert>
      ) : (
        <div className="rounded-xl border border-line bg-panel p-3.5 text-sm">
          <p className="mb-2 font-medium">অনুমোদন করলে যা পরিশোধিত হবে</p>
          <ul className="space-y-1">
            {plan.months.map((month) => (
              <li key={`${month.dueYear}-${month.dueMonth}`} className="flex justify-between gap-3">
                <span>
                  {month.label}
                  {month.late && <span className="text-warn"> · বিলম্বে</span>}
                  {!month.dueSettled && <span className="text-danger"> · আংশিক</span>}
                  {month.fineWaivedPaisa > 0 && (
                    <span className="text-positive"> · জরিমানা মওকুফ</span>
                  )}
                </span>
                <span className="tabular">
                  <Money paisa={month.toDue} />
                  {month.toFine > 0 && (
                    <span className="text-warn">
                      {' + '}
                      <Money paisa={month.toFine} /> জরিমানা
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {plan.shortfallPaisa > 0 && (
            <Alert tone="warn" className="mt-2">
              <Money paisa={plan.shortfallPaisa} /> কম দেওয়া হয়েছে — পুরোনো মাস আগে পরিশোধ হবে,
              বাকিটা বকেয়া থাকবে।
            </Alert>
          )}
          {plan.surplusPaisa > 0 && (
            <Alert tone="info" className="mt-2">
              <Money paisa={plan.surplusPaisa} /> অতিরিক্ত — অন্যান্য আয় হিসেবে যুক্ত হবে।
            </Alert>
          )}
        </div>
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
