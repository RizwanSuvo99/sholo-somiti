'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { Alert } from '@/components/ui/alert'
import { ImageUpload, type UploadedImage } from '@/components/shared/image-upload'
import { MemberSelect } from '@/components/shared/member-select'
import { DateField } from '@/components/shared/date-picker'
import {
  dueWindow,
  formatCivilDate,
  instantToDhakaCivil,
  type CivilDate,
} from '@/lib/due-cycle'
import { COLLECTION_START } from '@/lib/society'
import { formatBDT, fromPaisa } from '@/lib/money'
import { fineOwedFor, totalOwed } from '@/lib/settlement'
import { compareDueMonth, type DueMonth } from '@/lib/due-cycle'

type EligibleMonth = {
  dueMonth: number
  dueYear: number
  label: string
  amountPaisa: number | null
  outstandingDuePaisa: number
  chargedFinePaisa: number
  blocked: boolean
  blockedReason: string | null
  isCurrent: boolean
}

type Lookup = {
  found: true
  member: { id: string; memberCode: string; name: string }
  currentDue: { dueMonth: number; dueYear: number; label: string; amountPaisa: number | null }
  eligibleDueMonths: EligibleMonth[]
}

export type MemberOption = { memberCode: string; name: string; photoUrl?: string | null }

const MEDIUMS = [
  { value: 'NPSB', label: 'এনপিএসবি (NPSB)' },
  { value: 'EFT', label: 'ইএফটি (EFT)' },
  { value: 'MOBILE_BANKING', label: 'মোবাইল ব্যাংকিং' },
  { value: 'CASH_DEPOSIT', label: 'ক্যাশ ডিপোজিট' },
] as const

export function SubmissionForm({ members }: { members: MemberOption[] }) {
  const router = useRouter()

  const [memberCode, setMemberCode] = useState('')
  const [sendingDate, setSendingDate] = useState<CivilDate | null>(null)
  // Written only by onMemberSelected; the field itself is read-only.
  const [name, setName] = useState('')
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'missing'>('idle')
  const [selectedMonth, setSelectedMonth] = useState<string>('')

  const [medium, setMedium] = useState<string>('NPSB')
  const [screenshot, setScreenshot] = useState<UploadedImage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  const chosen = lookup?.eligibleDueMonths.find(
    (m) => `${m.dueYear}-${m.dueMonth}` === selectedMonth,
  )

  /**
   * Everything this payment would clear: the chosen month and any earlier one
   * still owing, each with its own ৳২০০ fine if its deadline has passed.
   *
   * A month with its own submission awaiting review is left out — that money is
   * already accounted for.
   *
   * The fine is worked out from the date the member says they sent the money,
   * using the same helper the approval uses, so the figure quoted here is the
   * one the ledger will record.
   */
  const coverage = useMemo(() => {
    if (!lookup || !chosen) return null

    const basis = sendingDate ?? instantToDhakaCivil(new Date())
    const upTo: DueMonth = { dueYear: chosen.dueYear, dueMonth: chosen.dueMonth }

    const months = lookup.eligibleDueMonths
      .filter(
        (month) =>
          !month.blocked &&
          compareDueMonth({ dueYear: month.dueYear, dueMonth: month.dueMonth }, upTo) <= 0,
      )
      .map((month) => {
        const dm: DueMonth = { dueYear: month.dueYear, dueMonth: month.dueMonth }
        return {
          ...dm,
          label: month.label,
          duePaisa: month.outstandingDuePaisa,
          finePaisa: fineOwedFor(dm, basis, month.chargedFinePaisa),
        }
      })
      .sort((a, b) => compareDueMonth(a, b))

    return { months, totalPaisa: totalOwed(months) }
  }, [lookup, chosen, sendingDate])

  // Derived, never typed: the member owes what the breakdown above adds up to.
  const amount = coverage ? String(fromPaisa(coverage.totalPaisa)) : ''

  /**
   * The third layer of the one-per-month rule: warn and block before the member
   * fills out anything else, rather than after they have uploaded a screenshot.
   */
  async function onMemberSelected(code: string) {
    setMemberCode(code)
    setLookup(null)
    setSelectedMonth('')

    // Fall back to the name from the dropdown straight away, so the field is
    // filled even if the lookup is slow or fails.
    setName(members.find((m) => m.memberCode === code)?.name ?? '')

    if (!code) {
      setLookupState('idle')
      return
    }

    setLookupState('loading')
    setError(null)

    try {
      const response = await fetch(`/api/public/members/lookup?code=${encodeURIComponent(code)}`)
      const result = await response.json()

      if (!result?.found) {
        setLookup(null)
        setLookupState('missing')
        return
      }

      setLookup(result)
      setLookupState('idle')
      setName(result.member.name)

      const open = result.eligibleDueMonths.filter((m: EligibleMonth) => !m.blocked)
      const preferred = open.find((m: EligibleMonth) => m.isCurrent) ?? open[0]
      setSelectedMonth(preferred ? `${preferred.dueYear}-${preferred.dueMonth}` : '')
    } catch {
      setLookupState('idle')
      setError('তথ্য যাচাই করা যায়নি — আবার চেষ্টা করুন')
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})

    if (!screenshot) {
      setError('লেনদেনের স্ক্রিনশট আপলোড করুন')
      return
    }
    if (!chosen) {
      setError('কোন মাসের চাঁদা তা বেছে নিন')
      return
    }
    if (!sendingDate) {
      setError('টাকা পাঠানোর তারিখ বেছে নিন')
      return
    }

    setPending(true)
    const data = new FormData(event.currentTarget)

    try {
      const response = await fetch('/api/public/submissions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          memberCode,
          name,
          sendingDate: formatCivilDate(sendingDate),
          amount,
          transactionRef: String(data.get('transactionRef') ?? ''),
          paymentMedium: medium,
          bankName: String(data.get('bankName') ?? '') || null,
          mobileBankingProvider: String(data.get('mobileBankingProvider') ?? '') || null,
          mobileBankingNumber: String(data.get('mobileBankingNumber') ?? '') || null,
          screenshotUrl: screenshot.url,
          screenshotPublicId: screenshot.publicId,
          dueMonth: chosen.dueMonth,
          dueYear: chosen.dueYear,
        }),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        const details = result?.error?.details
        if (Array.isArray(details)) {
          setFieldErrors(
            Object.fromEntries(details.map((d: { path: string; message: string }) => [d.path, d.message])),
          )
        }
        setError(result?.error?.messageBn ?? 'জমা দেওয়া যায়নি')
        return
      }

      router.push('/pay/submit/success')
    } catch {
      setError('সংযোগে সমস্যা হয়েছে')
    } finally {
      setPending(false)
    }
  }

  const openMonths = lookup?.eligibleDueMonths.filter((m) => !m.blocked) ?? []
  const allBlocked = Boolean(lookup) && openMonths.length === 0

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}

      {/* 1. ID Number — chosen from the society's active members */}
      <MemberSelect
        label="আইডি নম্বর"
        hint="তালিকা থেকে আপনার আইডি নম্বরটি বেছে নিন"
        required
        members={members}
        value={memberCode}
        onChange={(code) => void onMemberSelected(code)}
        placeholder="— আইডি নম্বর বাছুন —"
      />

      {lookupState === 'loading' && <p className="text-sm text-muted">যাচাই করা হচ্ছে…</p>}
      {lookupState === 'missing' && (
        <Alert tone="danger">এই আইডি নম্বরে কোনো সক্রিয় সদস্য পাওয়া যায়নি</Alert>
      )}

      {allBlocked && (
        <Alert tone="warn" title="এখন জমা দেওয়া যাবে না">
          <ul className="space-y-0.5">
            {(lookup?.eligibleDueMonths ?? []).map((month) => (
              <li key={`${month.dueYear}-${month.dueMonth}`}>
                {month.label} — {month.blockedReason ?? 'জমা দেওয়া যাবে না'}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {/* 2. Name — taken from the member record, not typed.
          Keeping it read-only means the name on a submission always matches the
          registered member, so a proof cannot be filed under a different name. */}
      <Field
        label="নাম"
        required
        hint={memberCode ? 'আইডি নম্বর অনুযায়ী স্বয়ংক্রিয়ভাবে পূরণ হয়েছে' : undefined}
      >
        <Input
          name="name"
          required
          readOnly
          tabIndex={-1}
          aria-readonly="true"
          value={name}
          placeholder="আইডি নম্বর বাছলে নাম আসবে"
          className="cursor-not-allowed bg-surface text-muted"
        />
      </Field>

      {/* 3. Sending date */}
      <DateField
        label="টাকা পাঠানোর তারিখ"
        required
        value={sendingDate}
        onChange={setSendingDate}
        error={fieldErrors.sendingDate}
        min={dueWindow(COLLECTION_START).startCivil}
        max={instantToDhakaCivil(new Date())}
        hint="ভবিষ্যতের তারিখ দেওয়া যাবে না"
      />

      {/* The extra field: which month this pays for. */}
      {lookup && !allBlocked && (
        <Field
          label="কোন মাস পর্যন্ত চাঁদা দিচ্ছেন"
          required
          hint="আগের কোনো মাস বাকি থাকলে সেগুলোসহ মোট পরিমাণ নিচে দেখানো হবে — প্রতিটি বকেয়া মাসের জন্য ৳২০০ জরিমানা যুক্ত হয়।"
        >
          <Select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
          >
            {lookup.eligibleDueMonths.map((month) => (
              <option
                key={`${month.dueYear}-${month.dueMonth}`}
                value={`${month.dueYear}-${month.dueMonth}`}
                disabled={month.blocked}
              >
                {month.label}
                {month.blocked
                  ? ` — ${month.blockedReason}`
                  : month.amountPaisa !== null
                    ? ` (${formatBDT(month.amountPaisa)})`
                    : ''}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {/* 4. Amount */}
      {coverage && coverage.months.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-3.5 text-sm">
          <p className="mb-2 font-medium">যা পরিশোধ হবে</p>
          <ul className="space-y-1">
            {coverage.months.map((month) => (
              <li key={`${month.dueYear}-${month.dueMonth}`} className="flex justify-between gap-3">
                <span className="text-muted">
                  {month.label}
                  {month.finePaisa > 0 && (
                    <span className="text-warn"> + জরিমানা</span>
                  )}
                </span>
                <span className="tabular font-medium">
                  {formatBDT(month.duePaisa + month.finePaisa)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between gap-3 border-t border-line pt-2 font-semibold">
            <span>মোট</span>
            <span className="tabular">{formatBDT(coverage.totalPaisa)}</span>
          </p>
        </div>
      )}

      {/* Read-only for the same reason the name is: the figure is the society's
          own, worked out from what the member owes. Letting it be typed over
          would put a number on the record that the breakdown above contradicts. */}
      <Field
        label="পরিমাণ (টাকা)"
        required
        error={fieldErrors.amount}
        hint="উপরের হিসাব অনুযায়ী স্বয়ংক্রিয়ভাবে নির্ধারিত — এই পরিমাণই পাঠাতে হবে"
      >
        <Input
          required
          readOnly
          tabIndex={-1}
          aria-readonly="true"
          placeholder="আইডি ও মাস বাছলে হিসাব আসবে"
          value={amount}
          className="cursor-not-allowed bg-surface text-muted"
        />
      </Field>

      {/* 5. Transaction ID */}
      <Field label="ট্রানজেকশন আইডি" required error={fieldErrors.transactionRef}>
        <Input name="transactionRef" required placeholder="বিকাশ / নগদ / ব্যাংক রেফারেন্স" />
      </Field>

      {/* 6. Payment medium, with its conditional branch */}
      <Field label="পেমেন্ট মাধ্যম" required>
        <Select name="paymentMedium" value={medium} onChange={(e) => setMedium(e.target.value)}>
          {MEDIUMS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      {medium === 'MOBILE_BANKING' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="সেবা" required error={fieldErrors.mobileBankingProvider}>
            <Select name="mobileBankingProvider" defaultValue="BKASH">
              <option value="BKASH">বিকাশ</option>
              <option value="NAGAD">নগদ</option>
            </Select>
          </Field>
          <Field label="যে নম্বর থেকে পাঠিয়েছেন" required error={fieldErrors.mobileBankingNumber}>
            <Input name="mobileBankingNumber" inputMode="tel" placeholder="01XXXXXXXXX" />
          </Field>
        </div>
      ) : (
        <Field label="ব্যাংকের নাম" required error={fieldErrors.bankName}>
          <Input name="bankName" placeholder="যেমন সোনালী ব্যাংক" />
        </Field>
      )}

      {/* 7. Screenshot */}
      <ImageUpload
        label="লেনদেনের স্ক্রিনশট"
        required
        signatureEndpoint="/api/public/uploads/signature"
        value={screenshot}
        onChange={setScreenshot}
      />

      <Button type="submit" className="w-full" disabled={pending || allBlocked || !lookup}>
        {pending ? 'জমা হচ্ছে…' : 'জমা দিন'}
      </Button>

      <p className="text-center text-xs text-muted">
        জমা দেওয়ার পর প্রশাসক যাচাই করলে তবেই এটি হিসাবে যুক্ত হবে।
      </p>
    </form>
  )
}
