import { prisma } from '@/lib/prisma'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Money } from '@/components/shared/money'
import { civilDateLabel, dueMonthLabel } from '@/lib/bn'
import { currentDueMonth, instantToDhakaCivil } from '@/lib/due-cycle'
import { toBnDigits } from '@/lib/money'
import { paginate } from '@/lib/paginate'
import { Pagination } from '@/components/shared/pagination'
import { ImportForms } from './import-forms'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'পুরোনো তথ্য — ষোলো সমবায় সমিতি' }

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const total = await prisma.historicalImport.count()
  const info = paginate(total, params.page)

  const current = currentDueMonth()

  const [batches, members, uniformBatches] = await Promise.all([
    prisma.historicalImport.findMany({
      orderBy: { createdAt: 'desc' },
      include: { performedBy: { select: { name: true } } },
      skip: info.skip,
      take: info.take,
    }),
    // Deactivated members are included on purpose: backfilling an old fine is
    // exactly when someone who has since left the society needs to be selected.
    prisma.member.findMany({
      select: { memberCode: true, name: true, isActive: true, photoUrl: true },
      orderBy: { memberCode: 'asc' },
    }),
    // Months a uniform import already covered, so the picker can grey them out.
    prisma.historicalImport.findMany({
      where: { kind: 'UNIFORM_DUE_IMPORT', month: { not: null }, year: { not: null } },
      select: { year: true, month: true },
    }),
  ])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">পুরোনো তথ্য যোগ</h1>
      <p className="text-sm text-muted">
        আগের বছরের হিসাব এখানে যোগ করুন। প্রতিটি ব্যাচ আলাদাভাবে সংরক্ষিত থাকে, তাই কী যোগ করা
        হয়েছে তা পরে দেখা যাবে।
      </p>

      <ImportForms
        members={members}
        currentDue={current}
        importedMonths={uniformBatches
          .filter((batch) => batch.year !== null && batch.month !== null)
          .map((batch) => ({ dueYear: batch.year!, dueMonth: batch.month! }))}
      />

      <Card className="overflow-hidden">
        <CardHeader title="যোগ করার ইতিহাস" />
        {batches.length === 0 ? (
          <CardBody>
            <p className="text-center text-muted">এখনো কিছু যোগ করা হয়নি</p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50/80 text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">কখন</th>
                  <th className="px-4 py-2.5 font-medium">ধরন</th>
                  <th className="px-4 py-2.5 font-medium">মাস</th>
                  <th className="px-4 py-2.5 font-medium">পরিমাণ</th>
                  <th className="px-4 py-2.5 font-medium">কতজন</th>
                  <th className="px-4 py-2.5 font-medium">বিবরণ</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {civilDateLabel(instantToDhakaCivil(batch.createdAt))}
                    </td>
                    <td className="px-4 py-2.5">
                      {batch.kind === 'FINE_IMPORT' ? 'জরিমানা' : 'সবার চাঁদা'}
                    </td>
                    <td className="px-4 py-2.5">
                      {batch.month && batch.year
                        ? dueMonthLabel({ dueYear: batch.year, dueMonth: batch.month })
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {batch.amountPaisa != null ? <Money paisa={batch.amountPaisa} /> : '—'}
                    </td>
                    <td className="px-4 py-2.5 tabular">{toBnDigits(batch.affectedCount)}</td>
                    <td className="px-4 py-2.5 text-muted">{batch.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination info={info} basePath="/admin/import" params={params} label="ব্যাচ" />
          </div>
        )}
      </Card>
    </div>
  )
}
