'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/alert'
import { MemberSelect } from '@/components/shared/member-select'
import { MonthPicker } from '@/components/shared/month-picker'
import { useToast } from '@/components/ui/toast'
import { COLLECTION_START } from '@/lib/society'
import { dueMonthLabel } from '@/lib/bn'
import { toBnDigits } from '@/lib/money'
import type { DueMonth } from '@/lib/due-cycle'

export type ImportMemberOption = {
  memberCode: string
  name: string
  isActive: boolean
  photoUrl?: string | null
}

export function ImportForms({
  members,
  importedMonths,
  currentDue,
}: {
  members: ImportMemberOption[]
  /** Months a uniform import has already covered. */
  importedMonths: DueMonth[]
  /** The month now open for collection; nothing later can be backfilled. */
  currentDue: DueMonth
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FineImportForm members={members} currentDue={currentDue} />
      <UniformImportForm importedMonths={importedMonths} currentDue={currentDue} />
    </div>
  )
}

/**
 * Posts an import and reports the result as a toast.
 *
 * Returns whether it succeeded so the caller can clear its fields — leaving a
 * filled-in form after a successful import invites submitting the same month
 * twice.
 */
function useImport(endpoint: string) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = useState(false)

  async function submit(payload: unknown, describe: (result: ImportResult) => string) {
    setPending(true)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        toast.error(result?.error?.messageBn ?? 'যোগ করা যায়নি')
        return false
      }

      toast.success(describe(result))
      router.refresh()
      return true
    } catch {
      toast.error('সংযোগে সমস্যা হয়েছে')
      return false
    } finally {
      setPending(false)
    }
  }

  return { submit, pending }
}

type ImportResult = { batchId: string; affected: number }

function FineImportForm({
  members,
  currentDue,
}: {
  members: ImportMemberOption[]
  currentDue: DueMonth
}) {
  const { submit, pending } = useImport('/api/admin/import/fines')

  const [memberCode, setMemberCode] = useState('')
  const [month, setMonth] = useState<DueMonth | null>(null)
  const [amount, setAmount] = useState('200')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // The member code rides in a hidden input, which HTML `required` does not
    // cover, and the month picker is not a native control either.
    if (!memberCode) return setError('সদস্য বেছে নিন')
    if (!month) return setError('মাস বেছে নিন')
    setError(null)

    const done = await submit(
      {
        memberCode,
        month: month.dueMonth,
        year: month.dueYear,
        amount,
        note,
      },
      () => 'জরিমানা যোগ হয়েছে',
    )

    if (done) {
      setMemberCode('')
      setMonth(null)
      setAmount('200')
      setNote('')
    }
  }

  return (
    <Card>
      <CardHeader title="এক সদস্যের জরিমানা" />
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}

          <MemberSelect
            label="সদস্যের আইডি"
            hint="তালিকা থেকে সদস্য বেছে নিন"
            required
            members={members}
            value={memberCode}
            onChange={setMemberCode}
            placeholder="— সদস্য বাছুন —"
          />

          <MonthPicker
            label="কোন মাসের জরিমানা"
            required
            value={month}
            onChange={setMonth}
            min={COLLECTION_START}
            max={currentDue}
            hint={`${dueMonthLabel(COLLECTION_START)} থেকে হিসাব শুরু`}
          />

          <Field label="জরিমানার পরিমাণ (টাকা)" required>
            <Input
              inputMode="decimal"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>

          <Field label="মন্তব্য">
            <Input value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'যোগ হচ্ছে…' : 'জরিমানা যোগ করুন'}
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

function UniformImportForm({
  importedMonths,
  currentDue,
}: {
  importedMonths: DueMonth[]
  currentDue: DueMonth
}) {
  const { submit, pending } = useImport('/api/admin/import/uniform-due')

  const [month, setMonth] = useState<DueMonth | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!month) return setError('মাস বেছে নিন')
    setError(null)

    if (!confirming) {
      setConfirming(true)
      return
    }

    const done = await submit(
      { month: month.dueMonth, year: month.dueYear, amount, note },
      (result) => `${toBnDigits(result.affected)} জন সদস্যের হিসাব যোগ হয়েছে`,
    )

    setConfirming(false)

    if (done) {
      setMonth(null)
      setAmount('')
      setNote('')
    }
  }

  return (
    <Card>
      <CardHeader title="সবার জন্য একই চাঁদা" />
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}

          <p className="text-sm text-muted">
            একবার দিলেই সব সক্রিয় সদস্যের জন্য ওই মাসের চাঁদা যোগ হবে — আলাদা করে দিতে হবে না।
          </p>

          <MonthPicker
            label="কোন মাসের চাঁদা"
            required
            value={month}
            onChange={(next) => {
              setMonth(next)
              setConfirming(false)
            }}
            min={COLLECTION_START}
            max={currentDue}
            disabledMonths={importedMonths}
            hint={`${dueMonthLabel(COLLECTION_START)} থেকে হিসাব শুরু`}
            disabledHint={
              importedMonths.length > 0
                ? `যোগ করা হয়ে গেছে এমন ${toBnDigits(importedMonths.length)}টি মাস বাছা যাবে না`
                : undefined
            }
          />

          <Field label="চাঁদার পরিমাণ (টাকা)" required>
            <Input
              inputMode="decimal"
              required
              placeholder="৫০০"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>

          <Field label="মন্তব্য">
            <Input value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>

          {confirming && month && (
            <Alert tone="warn">
              {dueMonthLabel(month)} মাসের জন্য সব সক্রিয় সদস্যের হিসাব যোগ হবে। নিশ্চিত হলে
              আবার চাপুন।
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
