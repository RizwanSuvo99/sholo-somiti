import Link from 'next/link'
import {
  getExpenseBreakdown,
  getMonthlyTotals,
  getPublicLedger,
  getPublicSummary,
} from '@/lib/queries/public'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { StatTile } from '@/components/public/stat-tile'
import { IconArrowDown, IconArrowUp, IconCalendar, IconReceipt, IconWallet } from '@/components/ui/icon'
import { Money } from '@/components/shared/money'
import { formatBDT, toBnDigits } from '@/lib/money'
import { civilDateLabel, monthNameBn } from '@/lib/bn'
import { paginate } from '@/lib/paginate'
import { Pagination } from '@/components/shared/pagination'

// Dynamic: both tables below are paged through the query string.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'হিসাব — ষোলো সমবায় সমিতি',
  description: 'সমিতির আয়, ব্যয় ও তহবিলের বিস্তারিত হিসাব',
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ mpage?: string; lpage?: string }>
}) {
  const query = await searchParams

  // Two tables on one page, so each carries its own page parameter. Page
  // numbers are resolved against the totals before the rows are fetched.
  const [summary, breakdown, monthlyCount, ledgerCount] = await Promise.all([
    getPublicSummary(),
    getExpenseBreakdown(),
    getMonthlyTotals(0, 1),
    getPublicLedger(0, 1),
  ])

  const monthlyInfo = paginate(monthlyCount.total, query.mpage)
  const ledgerInfo = paginate(ledgerCount.total, query.lpage)

  const [monthlyPage, ledgerPage] = await Promise.all([
    getMonthlyTotals(monthlyInfo.skip, monthlyInfo.take),
    getPublicLedger(ledgerInfo.skip, ledgerInfo.take),
  ])

  const monthly = monthlyPage.months
  const ledger = ledgerPage.entries

  const largestExpense = breakdown[0]?.amountPaisa ?? 0

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">সমিতির হিসাব</h1>
        <p className="mt-1 text-sm text-muted">
          সব আয় ও ব্যয়ের হিসাব সদস্যদের জন্য উন্মুক্ত।
        </p>
      </header>

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          tone="emerald"
          size="lg"
          label="বর্তমান তহবিল"
          value={formatBDT(summary.balancePaisa)}
          icon={<IconWallet className="size-5" />}
        />
        <StatTile
          tone="sky"
          label="মোট আয়"
          value={formatBDT(summary.totalCollectedPaisa)}
          icon={<IconArrowUp className="size-5" />}
        />
        <StatTile
          tone="rose"
          label="মোট ব্যয়"
          value={formatBDT(summary.totalExpensePaisa)}
          icon={<IconArrowDown className="size-5" />}
        />
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="আয়ের উৎস" accent={<span className="grid size-7 place-items-center rounded-lg bg-sky-100 text-sky-700"><IconArrowUp className="size-4" /></span>} />
          <CardBody className="space-y-3">
            <Proportion
              label="মাসিক চাঁদা"
              amountPaisa={summary.totalDuePaisa}
              totalPaisa={summary.totalCollectedPaisa}
              bar="bg-gradient-to-r from-sky-400 to-cyan-500"
            />
            <Proportion
              label="বিলম্ব জরিমানা"
              amountPaisa={summary.totalFinePaisa}
              totalPaisa={summary.totalCollectedPaisa}
              bar="bg-gradient-to-r from-amber-400 to-orange-500"
            />
            <Proportion
              label="অন্যান্য আয়"
              amountPaisa={summary.totalOtherIncomePaisa}
              totalPaisa={summary.totalCollectedPaisa}
              bar="bg-gradient-to-r from-violet-400 to-fuchsia-500"
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="ব্যয়ের খাত" accent={<span className="grid size-7 place-items-center rounded-lg bg-rose-100 text-rose-700"><IconArrowDown className="size-4" /></span>} />
          <CardBody className="space-y-3">
            {breakdown.length === 0 ? (
              <p className="text-center text-muted">এখনো কোনো ব্যয় হয়নি</p>
            ) : (
              breakdown.map((row, index) => (
                <Proportion
                  key={row.name}
                  label={row.name}
                  amountPaisa={row.amountPaisa}
                  totalPaisa={largestExpense}
                  bar={EXPENSE_BARS[index % EXPENSE_BARS.length]}
                />
              ))
            )}
          </CardBody>
        </Card>
      </section>

      {monthlyInfo.total > 0 && (
        <Card className="mb-6 overflow-hidden">
          <CardHeader title="মাসভিত্তিক আয়-ব্যয়" accent={<span className="grid size-7 place-items-center rounded-lg bg-indigo-100 text-indigo-700"><IconCalendar className="size-4" /></span>} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50/80 text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">মাস</th>
                  <th className="px-4 py-2.5 font-medium">আয়</th>
                  <th className="px-4 py-2.5 font-medium">ব্যয়</th>
                  <th className="px-4 py-2.5 font-medium">নিট</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((row) => {
                  const net = row.incomePaisa - row.expensePaisa
                  return (
                    <tr key={`${row.year}-${row.month}`} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {monthNameBn(row.month)} {toBnDigits(row.year)}
                      </td>
                      <td className="px-4 py-2.5 text-positive">
                        <Money paisa={row.incomePaisa} />
                      </td>
                      <td className="px-4 py-2.5 text-danger">
                        <Money paisa={row.expensePaisa} />
                      </td>
                      <td className={`px-4 py-2.5 ${net >= 0 ? 'text-positive' : 'text-danger'}`}>
                        <Money paisa={net} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pagination
              info={monthlyInfo}
              basePath="/accounts"
              params={query}
              pageKey="mpage"
              label="মাস"
            />
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader title="সাম্প্রতিক লেনদেন" accent={<span className="grid size-7 place-items-center rounded-lg bg-emerald-100 text-emerald-700"><IconReceipt className="size-4" /></span>} />
        {ledgerInfo.total === 0 ? (
          <CardBody>
            <p className="text-center text-muted">এখনো কোনো লেনদেন নেই</p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50/80 text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">তারিখ</th>
                  <th className="px-4 py-2.5 font-medium">বিবরণ</th>
                  <th className="px-4 py-2.5 font-medium">সদস্য</th>
                  <th className="px-4 py-2.5 font-medium">পরিমাণ</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry) => (
                  <tr key={entry.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                      {civilDateLabel(entry.entryDate)}
                    </td>
                    <td className="px-4 py-2.5">{entry.description}</td>
                    <td className="px-4 py-2.5 tabular">
                      {entry.memberCode ? (
                        <Link href={`/members/${entry.memberCode}`} className="text-brand hover:underline">
                          {entry.memberCode}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td
                      className={`px-4 py-2.5 whitespace-nowrap ${entry.type === 'INCOME' ? 'text-positive' : 'text-danger'}`}
                    >
                      {entry.type === 'INCOME' ? '+' : '−'}
                      <Money paisa={entry.amountPaisa} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              info={ledgerInfo}
              basePath="/accounts"
              params={query}
              pageKey="lpage"
              label="লেনদেন"
            />
          </div>
        )}
      </Card>
    </main>
  )
}

/** Expense heads cycle through these so each reads as its own category. */
const EXPENSE_BARS = [
  'bg-gradient-to-r from-rose-400 to-pink-500',
  'bg-gradient-to-r from-orange-400 to-amber-500',
  'bg-gradient-to-r from-purple-400 to-violet-500',
  'bg-gradient-to-r from-teal-400 to-emerald-500',
  'bg-gradient-to-r from-blue-400 to-indigo-500',
]

/** A labelled amount with a proportional bar. */
function Proportion({
  label,
  amountPaisa,
  totalPaisa,
  bar,
}: {
  label: string
  amountPaisa: number
  totalPaisa: number
  bar: string
}) {
  const percent = totalPaisa > 0 ? Math.round((amountPaisa / totalPaisa) * 100) : 0

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular font-semibold">
          <Money paisa={amountPaisa} />
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
