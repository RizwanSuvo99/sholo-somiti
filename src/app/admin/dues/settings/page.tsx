import { prisma } from '@/lib/prisma'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Money } from '@/components/shared/money'
import { dueMonthLabel } from '@/lib/bn'
import { paginate } from '@/lib/paginate'
import { Pagination } from '@/components/shared/pagination'
import { DueSettingForm } from './due-setting-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'চাঁদার পরিমাণ — ষোলো সমবায় সমিতি' }

export default async function DueSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const total = await prisma.monthlyDueSetting.count()
  const info = paginate(total, params.page)

  const settings = await prisma.monthlyDueSetting.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    skip: info.skip,
    take: info.take,
  })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">চাঁদার পরিমাণ</h1>
      <p className="text-sm text-muted">
        প্রতি মাসের চাঁদা আলাদা হতে পারে। একই মাস আবার দিলে পরিমাণ হালনাগাদ হবে।
      </p>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader title="মাসের চাঁদা নির্ধারণ" />
          <CardBody>
            <DueSettingForm />
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="নির্ধারিত মাসসমূহ" />
          {settings.length === 0 ? (
            <p className="p-8 text-center text-muted">এখনো কিছু নির্ধারণ করা হয়নি</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-slate-50/80 dark:bg-white/4 text-left text-xs tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">মাস</th>
                    <th className="px-4 py-2.5 font-medium">পরিমাণ</th>
                    <th className="px-4 py-2.5 font-medium">মন্তব্য</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.map((setting) => (
                    <tr key={setting.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5">
                        {dueMonthLabel({ dueYear: setting.year, dueMonth: setting.month })}
                      </td>
                      <td className="px-4 py-2.5">
                        <Money paisa={setting.amountPaisa} />
                      </td>
                      <td className="px-4 py-2.5 text-muted">{setting.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                info={info}
                basePath="/admin/dues/settings"
                params={params}
                label="মাস"
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
