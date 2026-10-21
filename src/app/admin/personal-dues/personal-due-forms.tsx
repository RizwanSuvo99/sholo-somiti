'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { MemberSelect, type MemberChoice } from '@/components/shared/member-select'
import { DateField } from '@/components/shared/date-picker'
import { formatCivilDate, instantToDhakaCivil, type CivilDate } from '@/lib/due-cycle'
import { formatBDT } from '@/lib/money'

export type PersonalDueFormsProps = {
  members: MemberChoice[]
  /** memberCode → what that person still owes, in paisa. */
  balances: Record<string, number>
  /**
   * Set on one person's page: the member is then fixed and the picker is shown
   * read-only, so an entry opened from Karim's page cannot land on Rahim.
   */
  lockedMemberCode?: string
}

/** Today in Dhaka — the day meant when the form is opened. */
function today(): CivilDate {
  return instantToDhakaCivil(new Date())
}

export function PersonalDueForms({ members, balances, lockedMemberCode }: PersonalDueFormsProps) {
  const [open, setOpen] = useState<'loan' | 'repayment' | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setOpen(open === 'loan' ? null : 'loan')}>
          নতুন ধার যোগ করুন
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setOpen(open === 'repayment' ? null : 'repayment')}
        >
          কিস্তি ফেরত নিন
        </Button>
      </div>

      {open === 'loan' && (
        <EntryForm
          kind="loan"
          members={members}
          balances={balances}
          lockedMemberCode={lockedMemberCode}
          onDone={() => setOpen(null)}
        />
      )}
      {open === 'repayment' && (
        <EntryForm
          kind="repayment"
          members={members}
          balances={balances}
          lockedMemberCode={lockedMemberCode}
          onDone={() => setOpen(null)}
        />
      )}
    </div>
  )
}

const COPY = {
  loan: {
    title: 'নতুন ধার',
    blurb: 'নিজের পকেট থেকে কাকে কত টাকা দিয়েছেন। এটি সমিতির হিসাবে যোগ হবে না।',
    endpoint: '/api/admin/personal-dues/loans',
    dateLabel: 'যেদিন টাকা দিয়েছেন',
    dateKey: 'lentOn',
    amountLabel: 'ধারের পরিমাণ (টাকা)',
    memberHint: 'যাঁকে টাকা দিয়েছেন',
    notePlaceholder: 'যেমন: ঈদের আগে হাতে দেওয়া',
    submitted: 'ধারের তথ্য যোগ হয়েছে',
  },
  repayment: {
    title: 'কিস্তি ফেরত',
    blurb: 'যে টাকা ফেরত পেয়েছেন। বাকির চেয়ে বেশি পরিমাণ দেওয়া যাবে না।',
    endpoint: '/api/admin/personal-dues/repayments',
    dateLabel: 'যেদিন ফেরত পেয়েছেন',
    dateKey: 'paidOn',
    amountLabel: 'ফেরতের পরিমাণ (টাকা)',
    memberHint: 'যাঁর কাছ থেকে ফেরত পেয়েছেন',
    notePlaceholder: 'যেমন: প্রথম কিস্তি',
    submitted: 'কিস্তি যোগ হয়েছে',
  },
} as const

function EntryForm({
  kind,
  members,
  balances,
  lockedMemberCode,
  onDone,
}: PersonalDueFormsProps & { kind: 'loan' | 'repayment'; onDone: () => void }) {
  const copy = COPY[kind]
  const router = useRouter()
  const toast = useToast()

  const [memberCode, setMemberCode] = useState(lockedMemberCode ?? '')
  const [date, setDate] = useState<CivilDate | null>(today())
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const remaining = memberCode ? (balances[memberCode] ?? 0) : null

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)

    // The member rides in a hidden input, which HTML `required` does not cover.
    if (!memberCode) return setError('সদস্য বেছে নিন')
    if (!date) return setError('তারিখ দিন')
    setError(null)
    setPending(true)

    try {
      const response = await fetch(copy.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          memberCode,
          amount: String(data.get('amount') ?? ''),
          [copy.dateKey]: formatCivilDate(date),
          note: String(data.get('note') ?? ''),
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        setError(payload?.error?.messageBn ?? 'সংরক্ষণ করা যায়নি')
        return
      }

      toast.success(copy.submitted)
      onDone()
      router.refresh()
    } catch {
      setError('সংযোগে সমস্যা হয়েছে')
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader title={copy.title} />
      <CardBody>
        <p className="mb-4 text-sm text-muted">{copy.blurb}</p>

        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          {error && (
            <Alert tone="danger" className="sm:col-span-2">
              {error}
            </Alert>
          )}

          <div>
            <MemberSelect
              label="সদস্য"
              hint={copy.memberHint}
              required
              disabled={Boolean(lockedMemberCode)}
              members={members}
              value={memberCode}
              onChange={setMemberCode}
              placeholder="— সদস্য বাছুন —"
            />
            {remaining !== null && (
              <p className="mt-1.5 text-xs text-muted">
                এখন বাকি: <span className="tabular font-medium">{formatBDT(remaining)}</span>
              </p>
            )}
          </div>

          <Field label={copy.amountLabel} required>
            <Input name="amount" inputMode="decimal" required autoFocus />
          </Field>

          <DateField label={copy.dateLabel} required value={date} onChange={setDate} />

          <Field label="মন্তব্য">
            <Input name="note" placeholder={copy.notePlaceholder} />
          </Field>

          <div className="flex items-end gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষণ'}
            </Button>
            <Button type="button" variant="secondary" onClick={onDone}>
              বাতিল
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
