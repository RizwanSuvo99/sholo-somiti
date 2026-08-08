import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/status-badge'
import { Money } from '@/components/shared/money'
import { currentDueMonth } from '@/lib/due-cycle'
import { BN_MONTHS, dueMonthLabel } from '@/lib/bn'
import { toBnDigits } from '@/lib/money'
import { paginate } from '@/lib/paginate'
import { Pagination } from '@/components/shared/pagination'
import { GenerateDuesButton } from './generate-dues-button'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'চাঁদা — ষোলো সমবায় সমিতি' }

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; page?: string }>
}) {
  const params = await searchParams
  const { month, year } = params
  const current = currentDueMonth()

  const selected = {
    dueMonth: month ? Number(month) : current.dueMonth,
    dueYear: year ? Number(year) : current.dueYear,
  }

  const where = { year: selected.dueYear, month: selected.dueMonth }

  const [total, setting, collectedTotal] = await Promise.all([
    prisma.duePayment.count({ where }),
    prisma.monthlyDueSetting.findUnique({
      where: { year_month: { year: selected.dueYear, month: selected.dueMonth } },
    }),
    // Summed across the whole month, not just the page on screen.
    prisma.duePayment.aggregate({ where, _sum: { amountPaidPaisa: true } }),
  ])

  const info = paginate(total, params.page)

  const rows = await prisma.duePayment.findMany({
    where,
    include: { member: { select: { memberCode: true, name: true } } },
    orderBy: { member: { memberCode: 'asc' } },
    skip: info.skip,
    take: info.take,
  })

  const collected = collectedTotal._sum.amountPaidPaisa ?? 0
  const years = [current.dueYear - 1, current.dueYear, current.dueYear + 1]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">চাঁদার হিসাব</h1>
        <Link href="/admin/dues/settings">
          <Button size="sm" variant="secondary">
            চাঁদার পরিমাণ
          </Button>
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <select
          name="month"
          defaultValue={selected.dueMonth}
          className="rounded-lg border border-line bg-panel px-3 py-2 text-sm"
        >
          {BN_MONTHS.slice(1).map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          name="year"
          defaultValue={selected.dueYear}
          className="rounded-lg border border-line bg-panel px-3 py-2 text-sm"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {toBnDigits(y)}
            </option>
          ))}
        </select>
        <Button size="sm" variant="secondary" type="submit">
          দেখুন
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-panel px-4 py-3 text-sm">
        <span>
          <span className="text-muted">নির্ধারিত চাঁদা: </span>
          {setting ? <Money paisa={setting.amountPaisa} /> : <span className="text-warn">নির্ধারণ করা হয়নি</span>}
        </span>
        <span>
          <span className="text-muted">আদায় হয়েছে: </span>
          <Money paisa={collected} />
        </span>
        <span className="ml-auto">
          <GenerateDuesButton month={selected.dueMonth} year={selected.dueYear} />
        </span>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title={`${dueMonthLabel(selected)} — ${toBnDigits(total)} জন`} />
        {rows.length === 0 ? (
          <p className="p-8 text-center text-muted">
            এই মাসের হিসাব এখনো তৈরি হয়নি। “হিসাব তৈরি করুন” চাপুন।
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50/80 text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">আইডি</th>
                  <th className="px-4 py-2.5 font-medium">নাম</th>
                  <th className="px-4 py-2.5 font-medium">চাঁদা</th>
                  <th className="px-4 py-2.5 font-medium">জমা</th>
                  <th className="px-4 py-2.5 font-medium">জরিমানা</th>
                  <th className="px-4 py-2.5 font-medium">অবস্থা</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 tabular">{row.member.memberCode}</td>
                    <td className="px-4 py-2.5">{row.member.name}</td>
                    <td className="px-4 py-2.5">
                      <Money paisa={row.amountDuePaisa} />
                    </td>
                    <td className="px-4 py-2.5">
                      <Money paisa={row.amountPaidPaisa} />
                    </td>
                    <td className="px-4 py-2.5">
                      {row.finePaisa > 0 ? <Money paisa={row.finePaisa} /> : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination info={info} basePath="/admin/dues" params={params} label="জন" />
          </div>
        )}
      </Card>
    </div>
  )
}
