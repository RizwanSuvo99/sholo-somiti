'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/alert'
import { MemberSelect } from '@/components/shared/member-select'
import { MonthPicker } from '@/components/shared/month-picker'
import { useToast } from '@/components/ui/toast'
import { COLLECTION_START } from '@/lib/society'
import { civilDateLabel, dueMonthLabel } from '@/lib/bn'
import { formatBDT, toBnDigits } from '@/lib/money'
import type { CivilDate, DueMonth } from '@/lib/due-cycle'

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
      <MemberBackfillForm members={members} currentDue={currentDue} />
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

type BackfillMonth = {
  dueYear: number
  dueMonth: number
  label: string
  amountPaisa: number
  outcome: 'WILL_ADD' | 'ALREADY_PAID' | 'UNPRICED'
}

type BackfillPlan = {
  member: { memberCode: string; name: string; photoUrl: string | null; joinedOn: CivilDate }
  months: BackfillMonth[]
  totalPaisa: number
  addCount: number
  alreadyPaidCount: number
  unpricedCount: number
  joinedOnWouldBecome: CivilDate | null
}

/**
 * Mode 3: settle every past month for one member who has just joined.
 *
 * The preview is the point of this form. It is the only one of the three that
 * writes a dozen rows at once, at amounts the admin never types, so it shows
 * exactly which months it will add and at what price before anything is
 * written. Money going into a register is not somewhere to be surprised.
 */
function MemberBackfillForm({
  members,
  currentDue,
}: {
  members: ImportMemberOption[]
  currentDue: DueMonth
}) {
  const { submit, pending } = useImport('/api/admin/import/member-dues')

  const [memberCode, setMemberCode] = useState('')
  const [from, setFrom] = useState<DueMonth | null>(COLLECTION_START)
  const [to, setTo] = useState<DueMonth | null>(currentDue)
  const [alignJoinedOn, setAlignJoinedOn] = useState(true)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  /**
   * The preview is stored against the inputs it answered, and read back only
   * when those still match. Deriving it this way means the effect never clears
   * state synchronously — so a stale plan cannot be shown for a moment after
   * the member changes, and there is no second render to flush the old one.
   */
  const key =
    memberCode && from && to
      ? `${memberCode}|${from.dueYear}-${from.dueMonth}|${to.dueYear}-${to.dueMonth}`
      : ''
  const ready = key !== ''

  const [answer, setAnswer] = useState<{
    key: string
    plan: BackfillPlan | null
    error: string | null
  } | null>(null)

  const current = answer?.key === key ? answer : null
  const plan = current?.plan ?? null
  const planError = current?.error ?? null
  const loadingPlan = ready && current === null

  useEffect(() => {
    if (!memberCode || !from || !to) return

    const controller = new AbortController()
    const query = new URLSearchParams({
      memberCode,
      fromYear: String(from.dueYear),
      fromMonth: String(from.dueMonth),
      toYear: String(to.dueYear),
      toMonth: String(to.dueMonth),
    })

    fetch(`/api/admin/import/member-dues/preview?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json().catch(() => null)
        if (controller.signal.aborted) return
        setAnswer({
          key,
          plan: response.ok ? result : null,
          error: response.ok ? null : (result?.error?.messageBn ?? 'হিসাব দেখা যায়নি'),
        })
      })
      .catch(() => {
        // An aborted request is a superseded one, not a failure.
        if (!controller.signal.aborted) {
          setAnswer({ key, plan: null, error: 'হিসাব দেখা যায়নি' })
        }
      })

    return () => controller.abort()
  }, [key, memberCode, from, to])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!memberCode) return setError('সদস্য বেছে নিন')
    if (!from || !to) return setError('শুরু ও শেষের মাস বেছে নিন')
    setError(null)

    const done = await submit(
      {
        memberCode,
        fromMonth: from.dueMonth,
        fromYear: from.dueYear,
        toMonth: to.dueMonth,
        toYear: to.dueYear,
        alignJoinedOn,
        note,
      },
      (result) => `${toBnDigits(result.affected)} মাসের চাঁদা যোগ হয়েছে`,
    )

    if (done) {
      setMemberCode('')
      setNote('')
      setAnswer(null)
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader title="নতুন সদস্যের পুরোনো মাসের চাঁদা" />
      <CardBody>
        <p className="mb-4 text-sm text-muted">
          যে সদস্য পরে যোগ দিয়ে আগের সব মাসের চাঁদা একসাথে পরিশোধ করেছেন, তাঁর জন্য। প্রতিটি মাসের
          পরিমাণ ওই মাসের জন্য নির্ধারিত পরিমাণ থেকেই নেওয়া হয় — টাইপ করতে হয় না।
        </p>

        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
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
              label="কোন মাস থেকে"
              required
              value={from}
              onChange={setFrom}
              min={COLLECTION_START}
              max={currentDue}
              hint={`${dueMonthLabel(COLLECTION_START)} থেকে হিসাব শুরু`}
            />

            <MonthPicker
              label="কোন মাস পর্যন্ত"
              required
              value={to}
              onChange={setTo}
              min={COLLECTION_START}
              max={currentDue}
            />

            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={alignJoinedOn}
                onChange={(event) => setAlignJoinedOn(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 rounded border-line accent-brand"
              />
              <span>
                সদস্য হওয়ার তারিখ প্রথম মাসের সাথে মিলিয়ে দিন
                <span className="mt-0.5 block text-xs text-muted">
                  না দিলে প্রোফাইলে যোগ দেওয়ার তারিখের আগের মাসের চাঁদা দেখাবে
                </span>
              </span>
            </label>

            <Field label="মন্তব্য">
              <Input value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>

            <Button
              type="submit"
              className="w-full"
              disabled={pending || !ready || !plan || plan.addCount === 0}
            >
              {pending ? 'যোগ হচ্ছে…' : 'পুরোনো চাঁদা যোগ করুন'}
            </Button>
          </div>

          <BackfillPreview plan={plan} error={planError} loading={loadingPlan} ready={ready} />
        </form>
      </CardBody>
    </Card>
  )
}

function BackfillPreview({
  plan,
  error,
  loading,
  ready,
}: {
  plan: BackfillPlan | null
  error: string | null
  loading: boolean
  ready: boolean
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="mb-3 text-sm font-medium">যোগ হবে</p>

      {!ready ? (
        <p className="text-sm text-muted">সদস্য ও মাস বেছে নিলে এখানে হিসাব দেখা যাবে।</p>
      ) : error ? (
        <Alert tone="danger">{error}</Alert>
      ) : loading && !plan ? (
        <p className="text-sm text-muted">হিসাব করা হচ্ছে…</p>
      ) : !plan ? null : (
        <>
          <ul className="mb-3 max-h-64 space-y-1 overflow-y-auto text-sm">
            {plan.months.map((month) => (
              <li
                key={`${month.dueYear}-${month.dueMonth}`}
                className="flex items-center justify-between gap-3 border-b border-line/60 py-1 last:border-0"
              >
                <span className={month.outcome === 'WILL_ADD' ? '' : 'text-muted line-through'}>
                  {month.label}
                </span>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  {month.outcome === 'ALREADY_PAID' && (
                    <span className="text-xs text-muted">আগেই পরিশোধিত</span>
                  )}
                  {month.outcome === 'UNPRICED' && (
                    <span className="text-xs text-danger">পরিমাণ নির্ধারিত নেই</span>
                  )}
                  <span className="tabular">
                    {month.amountPaisa > 0 ? formatBDT(month.amountPaisa) : '—'}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
            <span className="font-medium">
              {toBnDigits(plan.addCount)} মাস যোগ হবে
              {plan.alreadyPaidCount > 0 && (
                <span className="text-muted"> · {toBnDigits(plan.alreadyPaidCount)} বাদ</span>
              )}
            </span>
            <span className="tabular text-base font-semibold">{formatBDT(plan.totalPaisa)}</span>
          </div>

          {plan.unpricedCount > 0 && (
            <Alert tone="danger" className="mt-3">
              {toBnDigits(plan.unpricedCount)} মাসের চাঁদার পরিমাণ নির্ধারণ করা হয়নি — আগে ওই
              মাসগুলোর পরিমাণ নির্ধারণ করুন।
            </Alert>
          )}

          {plan.addCount === 0 && plan.unpricedCount === 0 && (
            <p className="mt-3 text-sm text-muted">এই মাসগুলোর হিসাব আগেই যোগ করা আছে।</p>
          )}

          {plan.joinedOnWouldBecome && (
            <p className="mt-3 text-xs text-muted">
              সদস্য হওয়ার তারিখ {civilDateLabel(plan.member.joinedOn)} থেকে{' '}
              {civilDateLabel(plan.joinedOnWouldBecome)} করা হবে।
            </p>
          )}
        </>
      )}
    </div>
  )
}
