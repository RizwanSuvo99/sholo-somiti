import { prisma } from '@/lib/prisma'
import { currentDueMonth, deadlineInstant, instantToDhakaCivil } from '@/lib/due-cycle'
import { civilDateLabel, dueMonthLabel } from '@/lib/bn'
import { formatBDT } from '@/lib/money'
import { Card, CardBody } from '@/components/ui/card'
import { getMemberOptions } from '@/lib/queries/public'
import { BankDetails } from '@/components/public/bank-details'
import { SubmissionForm } from './submission-form'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'চাঁদা জমার তথ্য — ষোলো সমবায় সমিতি',
  description: 'টাকা পাঠানোর পর এই ফরমে লেনদেনের তথ্য দিন',
}

export default async function SubmitPage() {
  const current = currentDueMonth()
  const [setting, members] = await Promise.all([
    prisma.monthlyDueSetting.findUnique({
      where: { year_month: { year: current.dueYear, month: current.dueMonth } },
      select: { amountPaisa: true },
    }),
    getMemberOptions(),
  ])

  const deadline = instantToDhakaCivil(deadlineInstant(current))

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">চাঁদা জমার তথ্য</h1>
        <p className="mt-1 text-sm text-muted">
          টাকা পাঠানোর পর নিচের তথ্যগুলো দিন — প্রশাসক যাচাই করে হিসাবে যুক্ত করবেন।
        </p>
      </header>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <InfoChip
          tone="from-indigo-50 to-blue-100/70 border-indigo-200/70 text-indigo-900"
          label="চলতি মাস"
          value={dueMonthLabel(current)}
        />
        <InfoChip
          tone="from-emerald-50 to-teal-100/70 border-emerald-200/70 text-emerald-900"
          label="চাঁদার পরিমাণ"
          value={setting ? formatBDT(setting.amountPaisa) : 'নির্ধারিত হয়নি'}
        />
        <InfoChip
          tone="from-amber-50 to-orange-100/70 border-amber-200/70 text-amber-900"
          label="শেষ তারিখ"
          value={civilDateLabel(deadline)}
          note="এরপরে ৳২০০ জরিমানা"
        />
      </div>

      <BankDetails className="mb-5" />

      <Card>
        <CardBody>
          <SubmissionForm members={members} />
        </CardBody>
      </Card>
    </main>
  )
}

function InfoChip({
  tone,
  label,
  value,
  note,
}: {
  tone: string
  label: string
  value: string
  note?: string
}) {
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-3.5 ${tone}`}>
      <p className="text-xs opacity-75">{label}</p>
      <p className="mt-0.5 font-semibold tabular">{value}</p>
      {note && <p className="mt-0.5 text-xs opacity-75">{note}</p>}
    </div>
  )
}
