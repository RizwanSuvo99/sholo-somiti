'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { MemberSelect } from '@/components/shared/member-select'
import { Alert } from '@/components/ui/alert'
import { BN_MONTHS } from '@/lib/bn'
import { toBnDigits } from '@/lib/money'

function MonthYear({ defaultYear }: { defaultYear: number }) {
  const years = [defaultYear - 2, defaultYear - 1, defaultYear]
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="মাস" required>
        <Select name="month" defaultValue="1">
          {BN_MONTHS.slice(1).map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="বছর" required>
        <Select name="year" defaultValue={String(defaultYear - 1)}>
          {years.map((year) => (
            <option key={year} value={year}>
              {toBnDigits(year)}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  )
}

export type ImportMemberOption = {
  memberCode: string
  name: string
  isActive: boolean
  photoUrl?: string | null
}

type ImportResult = { batchId: string; affected: number }

function useImport(endpoint: string) {
  const router = useRouter()
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(payload: unknown, describe: (result: ImportResult) => string) {
    setMessage(null)
    setPending(true)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        setMessage({ tone: 'danger', text: result?.error?.messageBn ?? 'যোগ করা যায়নি' })
        return
      }

      setMessage({ tone: 'success', text: describe(result) })
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return { submit, message, pending, setMessage }
}

export function ImportForms({ members }: { members: ImportMemberOption[] }) {
  const year = new Date().getUTCFullYear()

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FineImportForm defaultYear={year} members={members} />
      <UniformImportForm defaultYear={year} />
    </div>
  )
}

function FineImportForm({
  defaultYear,
  members,
}: {
  defaultYear: number
  members: ImportMemberOption[]
}) {
  const { submit, message, pending, setMessage } = useImport('/api/admin/import/fines')
  const [memberCode, setMemberCode] = useState('')

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // A hidden input is not covered by HTML's `required`, so the check is here.
    if (!memberCode) {
      setMessage({ tone: 'danger', text: 'সদস্য বেছে নিন' })
      return
    }

    const data = new FormData(event.currentTarget)
    void submit(
      {
        memberCode,
        month: Number(data.get('month')),
        year: Number(data.get('year')),
        amount: String(data.get('amount') ?? ''),
        note: String(data.get('note') ?? ''),
      },
      () => 'জরিমানা যোগ হয়েছে',
    )
  }

  return (
    <Card>
      <CardHeader title="এক সদস্যের জরিমানা" />
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          {message && <Alert tone={message.tone}>{message.text}</Alert>}

          <MemberSelect
            label="সদস্যের আইডি"
            hint="তালিকা থেকে সদস্য বেছে নিন"
            required
            members={members}
            value={memberCode}
            onChange={setMemberCode}
            placeholder="— সদস্য বাছুন —"
          />

          <MonthYear defaultYear={defaultYear} />

          <Field label="জরিমানার পরিমাণ (টাকা)" required>
            <Input name="amount" inputMode="decimal" required defaultValue="200" />
          </Field>

          <Field label="মন্তব্য">
            <Input name="note" />
          </Field>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'যোগ হচ্ছে…' : 'জরিমানা যোগ করুন'}
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

function UniformImportForm({ defaultYear }: { defaultYear: number }) {
  const { submit, message, pending } = useImport('/api/admin/import/uniform-due')
  const [confirming, setConfirming] = useState(false)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!confirming) {
      setConfirming(true)
      return
    }

    const data = new FormData(event.currentTarget)
    void submit(
      {
        month: Number(data.get('month')),
        year: Number(data.get('year')),
        amount: String(data.get('amount') ?? ''),
        note: String(data.get('note') ?? ''),
      },
      (result) => `${toBnDigits(result.affected)} জন সদস্যের হিসাব যোগ হয়েছে`,
    )
    setConfirming(false)
  }

  return (
    <Card>
      <CardHeader title="সবার জন্য একই চাঁদা" />
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          {message && <Alert tone={message.tone}>{message.text}</Alert>}

          <p className="text-sm text-muted">
            একবার দিলেই সব সক্রিয় সদস্যের জন্য ওই মাসের চাঁদা যোগ হবে — আলাদা করে দিতে হবে না।
          </p>

          <MonthYear defaultYear={defaultYear} />

          <Field label="চাঁদার পরিমাণ (টাকা)" required>
            <Input name="amount" inputMode="decimal" required placeholder="৫০০" />
          </Field>

          <Field label="মন্তব্য">
            <Input name="note" />
          </Field>

          {confirming && (
            <Alert tone="warn">
              সব সক্রিয় সদস্যের জন্য এই মাসের হিসাব যোগ হবে। নিশ্চিত হলে আবার চাপুন।
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full"
            variant={confirming ? 'danger' : 'primary'}
            disabled={pending}
          >
            {pending ? 'যোগ হচ্ছে…' : confirming ? 'নিশ্চিত করুন' : 'সবার জন্য যোগ করুন'}
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}
