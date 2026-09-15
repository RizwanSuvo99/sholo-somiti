'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { Money } from '@/components/shared/money'
import { civilDateLabel, INCOME_CATEGORY_BN } from '@/lib/bn'
import { parseCivilDate } from '@/lib/due-cycle'

export type TransactionRow = {
  id: string
  type: 'INCOME' | 'EXPENSE'
  category: string
  note: string
  amountPaisa: number
  /** `YYYY-MM-DD`. */
  entryDate: string
  memberCode: string | null
  memberId: string | null
  voidedAt: string | null
  voidReason: string | null
}

/**
 * The ledger.
 *
 * A wrong entry is **voided, never deleted**: the row stays with its reason
 * attached and every total filters it out. Deleting would leave a gap in a
 * financial record that no one could later explain, so the dialog asks for a
 * reason and makes clear the row will remain visible.
 */
export function TransactionsTable({ rows }: { rows: TransactionRow[] }) {
  const router = useRouter()
  const toast = useToast()

  const [voiding, setVoiding] = useState<TransactionRow | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function close() {
    setVoiding(null)
    setReason('')
    setError(null)
  }

  async function confirmVoid() {
    if (!voiding) return

    if (reason.trim().length < 3) {
      setError('বাতিলের কারণ অন্তত ৩ অক্ষরের হতে হবে')
      return
    }

    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/transactions/${voiding.id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        toast.error(payload?.error?.messageBn ?? 'বাতিল করা যায়নি')
        return
      }

      toast.success('লেনদেনটি বাতিল করা হয়েছে', 'হিসাব থেকে বাদ পড়েছে, তালিকায় থেকে যাবে')
      router.refresh()
      close()
    } catch {
      toast.error('সংযোগে সমস্যা হয়েছে')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50/80 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-2.5 font-medium">তারিখ</th>
              <th className="px-4 py-2.5 font-medium">ধরন</th>
              <th className="px-4 py-2.5 font-medium">খাত</th>
              <th className="px-4 py-2.5 font-medium">সদস্য</th>
              <th className="px-4 py-2.5 font-medium">বিবরণ</th>
              <th className="px-4 py-2.5 font-medium">পরিমাণ</th>
              <th className="px-4 py-2.5 text-right font-medium">কাজ</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-line last:border-0 ${row.voidedAt ? 'opacity-55' : 'hover:bg-surface'}`}
              >
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {civilDateLabel(parseCivilDate(row.entryDate))}
                </td>

                <td className="px-4 py-2.5">
                  {row.type === 'INCOME' ? (
                    <span className="text-positive">আয়</span>
                  ) : (
                    <span className="text-danger">ব্যয়</span>
                  )}
                </td>

                <td className="px-4 py-2.5">
                  {row.type === 'INCOME' ? (INCOME_CATEGORY_BN[row.category] ?? row.category) : row.category}
                </td>

                <td className="px-4 py-2.5 tabular text-muted">
                  {row.memberCode && row.memberId ? (
                    <Link href={`/admin/members/${row.memberId}`} className="hover:text-brand hover:underline">
                      {row.memberCode}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>

                <td className="px-4 py-2.5">
                  <span className={row.voidedAt ? 'line-through' : undefined}>{row.note}</span>
                  {row.voidedAt && (
                    <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 ring-1 ring-rose-200 ring-inset">
                      বাতিল: {row.voidReason}
                    </span>
                  )}
                </td>

                <td className="px-4 py-2.5 whitespace-nowrap">
                  <Money paisa={row.amountPaisa} />
                </td>

                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {row.voidedAt ? (
                    <span className="text-xs text-muted">বাতিলকৃত</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setVoiding(row)}
                      aria-label={`${row.note} বাতিল করুন`}
                    >
                      বাতিল
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={voiding !== null}
        onClose={close}
        size="sm"
        title="লেনদেন বাতিল করবেন?"
        description="লেনদেনটি মুছে যাবে না — হিসাব থেকে বাদ পড়বে কিন্তু কারণসহ তালিকায় থেকে যাবে, যাতে পরে বোঝা যায় কী হয়েছিল।"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={close} disabled={pending}>
              ফিরে যান
            </Button>
            <Button variant="danger" size="sm" onClick={confirmVoid} disabled={pending}>
              {pending ? 'অপেক্ষা করুন…' : 'বাতিল নিশ্চিত করুন'}
            </Button>
          </>
        }
      >
        <Field label="বাতিলের কারণ" required error={error ?? undefined}>
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="যেমন: ভুল পরিমাণ লেখা হয়েছিল"
          />
        </Field>
      </Modal>
    </>
  )
}
