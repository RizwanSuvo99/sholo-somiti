'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { Alert } from '@/components/ui/alert'
import { BN_MONTHS } from '@/lib/bn'
import { toBnDigits } from '@/lib/money'

export function DueSettingForm() {
  const router = useRouter()
  const now = new Date()
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setPending(true)

    const data = new FormData(event.currentTarget)

    try {
      const response = await fetch('/api/admin/due-settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          month: Number(data.get('month')),
          year: Number(data.get('year')),
          amount: String(data.get('amount') ?? ''),
          note: String(data.get('note') ?? ''),
        }),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        setMessage({ tone: 'danger', text: result?.error?.messageBn ?? 'সংরক্ষণ করা যায়নি' })
        return
      }

      setMessage({ tone: 'success', text: 'সংরক্ষিত হয়েছে' })
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  const thisYear = now.getUTCFullYear()
  const years = [thisYear - 1, thisYear, thisYear + 1]

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="grid grid-cols-2 gap-3">
        <Field label="মাস" required>
          <Select name="month" defaultValue={String(now.getUTCMonth() + 1)}>
            {BN_MONTHS.slice(1).map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="বছর" required>
          <Select name="year" defaultValue={String(thisYear)}>
            {years.map((year) => (
              <option key={year} value={year}>
                {toBnDigits(year)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="চাঁদার পরিমাণ (টাকা)" required>
        <Input name="amount" inputMode="decimal" required placeholder="৫০০" />
      </Field>

      <Field label="মন্তব্য">
        <Input name="note" />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষণ করুন'}
      </Button>
    </form>
  )
}
