import { prisma } from '@/lib/prisma'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Money } from '@/components/shared/money'
import { toBnDigits } from '@/lib/money'
import { paginate } from '@/lib/paginate'
import { Pagination } from '@/components/shared/pagination'
import { dbDateToCivil, formatCivilDate } from '@/lib/due-cycle'
import { TransactionsTable } from './transactions-table'
import { TransactionForms } from './transaction-forms'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'আয়-ব্যয় — ষোলো সমবায় সমিতি' }

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>
}) {
  const params = await searchParams
  const { type } = params

  // Narrow to the literal union so Prisma keeps its enum typing on `where`.
  const typeFilter =
    type === 'INCOME' ? ('INCOME' as const) : type === 'EXPENSE' ? ('EXPENSE' as const) : undefined
  const where = typeFilter ? { type: typeFilter } : {}
  const total = await prisma.transaction.count({ where })
  const info = paginate(total, params.page)

  const [items, categories, members, totals] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        member: { select: { memberCode: true, name: true } },
        expenseCategory: { select: { name: true } },
      },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      skip: info.skip,
      take: info.take,
    }),
    prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.member.findMany({
      where: { isActive: true },
      select: { id: true, memberCode: true, name: true, photoUrl: true },
      orderBy: { memberCode: 'asc' },
    }),
    // Totals cover every matching row, not only the page being displayed.
    prisma.transaction.groupBy({
      by: ['type'],
      where: { ...where, voidedAt: null },
      _sum: { amountPaisa: true },
    }),
  ])

  const sumOf = (kind: 'INCOME' | 'EXPENSE') =>
    totals.find((row) => row.type === kind)?._sum?.amountPaisa ?? 0
  const incomeTotal = sumOf('INCOME')
  const expenseTotal = sumOf('EXPENSE')

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">আয়-ব্যয়</h1>

      <TransactionForms categories={categories} members={members} />

      <div className="flex flex-wrap gap-4 rounded-lg border border-line bg-panel px-4 py-3 text-sm">
        <span>
          <span className="text-muted">আয়: </span>
          <span className="text-positive">
            <Money paisa={incomeTotal} />
          </span>
        </span>
        <span>
          <span className="text-muted">ব্যয়: </span>
          <span className="text-danger">
            <Money paisa={expenseTotal} />
          </span>
        </span>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title={`সব লেনদেন (${toBnDigits(total)})`} />
        {items.length === 0 ? (
          <CardBody>
            <p className="text-center text-muted">এখনো কোনো লেনদেন নেই</p>
          </CardBody>
        ) : (
          <>
            <TransactionsTable
              rows={items.map((item) => ({
                id: item.id,
                type: item.type,
                category:
                  item.type === 'INCOME'
                    ? (item.incomeCategory ?? '')
                    : (item.expenseCategory?.name ?? item.expenseCategoryText ?? '—'),
                note: item.note,
                amountPaisa: item.amountPaisa,
                entryDate: formatCivilDate(dbDateToCivil(item.entryDate)),
                memberCode: item.member?.memberCode ?? null,
                memberId: item.memberId,
                voidedAt: item.voidedAt ? item.voidedAt.toISOString() : null,
                voidReason: item.voidReason,
              }))}
            />
            <Pagination info={info} basePath="/admin/transactions" params={params} label="লেনদেন" />
          </>
        )}
      </Card>
    </div>
  )
}
