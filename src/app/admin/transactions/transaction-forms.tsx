'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { MemberSelect } from '@/components/shared/member-select'
import { DateField } from '@/components/shared/date-picker'
import { formatCivilDate, instantToDhakaCivil, type CivilDate } from '@/lib/due-cycle'
import { Alert } from '@/components/ui/alert'

type Category = { id: string; name: string }
type Member = { id: string; memberCode: string; name: string; photoUrl?: string | null }

export function TransactionForms({
  categories,
  members,
}: {
  categories: Category[]
  members: Member[]
}) {
  const [open, setOpen] = useState<'income' | 'expense' | 'delayFee' | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setOpen(open === 'income' ? null : 'income')}>
          আয় যোগ করুন
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setOpen(open === 'expense' ? null : 'expense')}
        >
          ব্যয় যোগ করুন
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setOpen(open === 'delayFee' ? null : 'delayFee')}
        >
          বিলম্ব ফি যোগ করুন
        </Button>
      </div>

      {open === 'income' && <IncomeForm members={members} onDone={() => setOpen(null)} />}
      {open === 'expense' && <ExpenseForm categories={categories} onDone={() => setOpen(null)} />}
      {open === 'delayFee' && <DelayFeeForm members={members} onDone={() => setOpen(null)} />}
    </div>
  )
}

function useSubmit(onDone: () => void, endpoint = '/api/admin/transactions') {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(payload: unknown) {
    setError(null)
    setPending(true)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => null)
        setError(result?.error?.messageBn ?? 'সংরক্ষণ করা যায়নি')
        return
      }
      onDone()
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return { submit, error, pending }
}

/** Today in Dhaka, which is the day an admin means when they open the form. */
function today(): CivilDate {
  return instantToDhakaCivil(new Date())
}

function IncomeForm({ members, onDone }: { members: Member[]; onDone: () => void }) {
  const { submit, error, pending } = useSubmit(onDone)
  const [memberCode, setMemberCode] = useState('')
  const [entryDate, setEntryDate] = useState<CivilDate | null>(today())

  const memberId = members.find((member) => member.memberCode === memberCode)?.id ?? null

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void submit({
      type: 'INCOME',
      incomeCategory: String(data.get('incomeCategory')),
      amount: String(data.get('amount') ?? ''),
      memberId,
      note: String(data.get('note') ?? ''),
      entryDate: entryDate ? formatCivilDate(entryDate) : '',
    })
  }

  return (
    <Card>
      <CardHeader title="নতুন আয়" />
      <CardBody>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          {error && <Alert tone="danger" className="sm:col-span-2">{error}</Alert>}

          <Field label="খাত" required>
            <Select name="incomeCategory" defaultValue="OTHER_INCOME">
              <option value="MONTHLY_DUE">মাসিক চাঁদা</option>
              <option value="FINE">জরিমানা</option>
              <option value="OTHER_INCOME">অন্যান্য আয়</option>
            </Select>
          </Field>

          <Field label="পরিমাণ (টাকা)" required>
            <Input name="amount" inputMode="decimal" required />
          </Field>

          <MemberSelect
            label="সদস্য"
            hint="নির্দিষ্ট সদস্যের সাথে সম্পর্কিত হলে"
            members={members}
            value={memberCode}
            onChange={setMemberCode}
            placeholder="— কেউ নয় —"
          />

          <DateField label="তারিখ" required value={entryDate} onChange={setEntryDate} />

          <Field label="বিবরণ" required>
            <Input name="note" required placeholder="টাকাটি কিসের জন্য" />
          </Field>

          <div className="flex items-end gap-2">
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

function ExpenseForm({ categories, onDone }: { categories: Category[]; onDone: () => void }) {
  const { submit, error, pending } = useSubmit(onDone)
  const [entryDate, setEntryDate] = useState<CivilDate | null>(today())

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const categoryId = String(data.get('expenseCategoryId') ?? '')
    void submit({
      type: 'EXPENSE',
      expenseCategoryId: categoryId || null,
      expenseCategoryText: categoryId ? null : String(data.get('expenseCategoryText') ?? ''),
      amount: String(data.get('amount') ?? ''),
      note: String(data.get('note') ?? ''),
      entryDate: entryDate ? formatCivilDate(entryDate) : '',
    })
  }

  return (
    <Card>
      <CardHeader title="নতুন ব্যয়" />
      <CardBody>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          {error && <Alert tone="danger" className="sm:col-span-2">{error}</Alert>}

          <Field label="খাত" required>
            <Select name="expenseCategoryId" defaultValue={categories[0]?.id ?? ''}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
              <option value="">— নতুন খাত লিখব —</option>
            </Select>
          </Field>

          <Field label="নতুন খাতের নাম" hint="উপরে “নতুন খাত লিখব” বেছে নিলে">
            <Input name="expenseCategoryText" />
          </Field>

          <Field label="পরিমাণ (টাকা)" required>
            <Input name="amount" inputMode="decimal" required />
          </Field>

          <DateField label="তারিখ" required value={entryDate} onChange={setEntryDate} />

          <Field label="বিবরণ" required>
            <Input name="note" required placeholder="খরচটি কিসের জন্য" />
          </Field>

          <div className="flex items-end gap-2">
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

/**
 * A delay fee for one member.
 *
 * Its own form rather than another option in the income dropdown, because a
 * delay fee must belong to somebody. The generic income form leaves the member
 * optional — correct for a donation, wrong for a charge levied on a person —
 * so `DELAY_FEE` is deliberately absent from that dropdown and lives here,
 * where the member cannot be left blank.
 *
 * It is not counted in the member's মোট জমা. That is enforced in the query
 * layer, not here: the deposit total is an allowlist of categories, so a fee
 * is excluded by construction rather than by a filter someone has to remember.
 */
function DelayFeeForm({ members, onDone }: { members: Member[]; onDone: () => void }) {
  const { submit, error, pending } = useSubmit(onDone, '/api/admin/transactions/delay-fee')
  const [memberCode, setMemberCode] = useState('')
  const [entryDate, setEntryDate] = useState<CivilDate | null>(today())
  const [missing, setMissing] = useState<string | null>(null)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)

    // The member rides in a hidden input, which HTML `required` does not cover.
    if (!memberCode) return setMissing('সদস্য বেছে নিন')
    setMissing(null)

    void submit({
      memberCode,
      amount: String(data.get('amount') ?? ''),
      note: String(data.get('note') ?? ''),
      entryDate: entryDate ? formatCivilDate(entryDate) : '',
    })
  }

  return (
    <Card>
      <CardHeader title="বিলম্ব ফি" />
      <CardBody>
        <p className="mb-4 text-sm text-muted">
          দেরিতে যোগ দেওয়া সদস্যের জন্য আলাদা ফি। এটি জরিমানা নয় এবং সদস্যের “মোট জমা”-তে যুক্ত
          হবে না — আলাদাভাবে দেখানো হবে।
        </p>

        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          {(error || missing) && (
            <Alert tone="danger" className="sm:col-span-2">
              {error ?? missing}
            </Alert>
          )}

          <MemberSelect
            label="সদস্য"
            hint="যাঁর কাছ থেকে বিলম্ব ফি নেওয়া হয়েছে"
            required
            members={members}
            value={memberCode}
            onChange={setMemberCode}
            placeholder="— সদস্য বাছুন —"
          />

          <Field label="বিলম্ব ফি (টাকা)" required>
            <Input name="amount" inputMode="decimal" required />
          </Field>

          <DateField label="তারিখ" required value={entryDate} onChange={setEntryDate} />

          <Field label="মন্তব্য">
            <Input name="note" placeholder="প্রয়োজনে কারণ লিখুন" />
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
