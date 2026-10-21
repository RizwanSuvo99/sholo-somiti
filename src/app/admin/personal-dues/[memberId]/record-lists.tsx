'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { Money } from '@/components/shared/money'
import { civilDateLabel } from '@/lib/bn'
import { parseCivilDate } from '@/lib/due-cycle'

export type RecordRow = {
  id: string
  amountPaisa: number
  /** `YYYY-MM-DD` — a plain string, so it crosses the server boundary cleanly. */
  date: string
  note: string | null
}

export type RecordListKind = 'loan' | 'repayment'

const COPY = {
  loan: {
    title: 'যা ধার দিয়েছেন',
    dateHeading: 'তারিখ',
    empty: 'কোনো ধারের তথ্য নেই।',
    endpoint: 'loans',
    confirmTitle: 'ধারের তথ্য মুছবেন?',
    confirmBody:
      'এই লাইনটি একেবারে মুছে যাবে এবং মোট পাওনা কমে যাবে। ফিরিয়ে আনার উপায় নেই — আবার লিখতে হবে।',
    deleted: 'ধারের তথ্য মুছে ফেলা হয়েছে',
    amountClass: 'text-ink',
  },
  repayment: {
    title: 'যা ফেরত পেয়েছেন',
    dateHeading: 'তারিখ',
    empty: 'এখনো কোনো কিস্তি ফেরত পাননি।',
    endpoint: 'repayments',
    confirmTitle: 'কিস্তিটি মুছবেন?',
    confirmBody:
      'কিস্তিটি একেবারে মুছে যাবে এবং টাকাটি আবার বাকির সাথে যোগ হবে। ফিরিয়ে আনার উপায় নেই।',
    deleted: 'কিস্তিটি মুছে ফেলা হয়েছে',
    amountClass: 'text-positive',
  },
} as const

/**
 * One side of a person's lending history, with a delete per row.
 *
 * A real delete, unlike the society ledger's soft void: that void exists so
 * members can be shown why a figure changed, and this book has one reader. The
 * dialog therefore says plainly that the line disappears for good, and the
 * server still refuses a delete that would leave repayments standing against a
 * debt that no longer exists.
 */
export function RecordList({ kind, rows }: { kind: RecordListKind; rows: RecordRow[] }) {
  const copy = COPY[kind]
  const router = useRouter()
  const toast = useToast()

  const [deleting, setDeleting] = useState<RecordRow | null>(null)
  const [pending, setPending] = useState(false)

  async function confirmDelete() {
    if (!deleting) return
    setPending(true)
    try {
      const response = await fetch(`/api/admin/personal-dues/${copy.endpoint}/${deleting.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        toast.error(payload?.error?.messageBn ?? 'মুছে ফেলা যায়নি')
        return
      }

      toast.success(copy.deleted)
      setDeleting(null)
      router.refresh()
    } catch {
      toast.error('সংযোগে সমস্যা হয়েছে')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader title={copy.title} />

        {rows.length === 0 ? (
          <CardBody>
            <p className="py-4 text-center text-muted">{copy.empty}</p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50/80 text-left text-xs tracking-wide text-muted uppercase dark:bg-white/4">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{copy.dateHeading}</th>
                  <th className="px-4 py-2.5 font-medium">পরিমাণ</th>
                  <th className="px-4 py-2.5 font-medium">মন্তব্য</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    <span className="sr-only">কাজ</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {civilDateLabel(parseCivilDate(row.date))}
                    </td>
                    <td className={`px-4 py-2.5 whitespace-nowrap ${copy.amountClass}`}>
                      <Money paisa={row.amountPaisa} />
                    </td>
                    <td className="px-4 py-2.5 text-muted">{row.note || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setDeleting(row)}
                        aria-label={`${civilDateLabel(parseCivilDate(row.date))} তারিখের লাইনটি মুছুন`}
                      >
                        মুছুন
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        size="sm"
        title={copy.confirmTitle}
        description={copy.confirmBody}
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDeleting(null)}
              disabled={pending}
            >
              ফিরে যান
            </Button>
            <Button variant="danger" size="sm" onClick={confirmDelete} disabled={pending}>
              {pending ? 'অপেক্ষা করুন…' : 'মুছে ফেলুন'}
            </Button>
          </>
        }
      >
        {deleting && (
          <p className="text-sm text-muted">
            <span className="tabular font-medium text-ink">
              <Money paisa={deleting.amountPaisa} />
            </span>{' '}
            — {civilDateLabel(parseCivilDate(deleting.date))}
          </p>
        )}
      </Modal>
    </>
  )
}
