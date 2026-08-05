import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getMemberHistory } from '@/lib/services/members'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/status-badge'
import { Money } from '@/components/shared/money'
import { toBnDigits } from '@/lib/money'
import { paginate } from '@/lib/paginate'
import { Pagination } from '@/components/shared/pagination'
import { civilDateLabel, dueMonthLabel } from '@/lib/bn'
import { DeactivateButton } from './deactivate-button'

export const dynamic = 'force-dynamic'

export default async function MemberProfilePage({
  params,
  searchParams,
}: PageProps<'/admin/members/[id]'>) {
  const { id } = await params
  const query = await searchParams
  const history = await getMemberHistory(id)
  if (!history) notFound()

  const { member, duePayments: allDuePayments, totalContributedPaisa } = history

  // The history is one row per month, so it stays small enough to page in memory.
  const info = paginate(allDuePayments.length, query.page)
  const duePayments = allDuePayments.slice(info.skip, info.skip + info.take)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          {member.photoUrl ? (
            <Image
              src={member.photoUrl}
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 rounded-full border border-line object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-xl font-semibold text-brand">
              {member.name.slice(0, 1)}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold">{member.name}</h1>
            <p className="tabular text-sm text-muted">{member.memberCode}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/members/${member.id}/edit`}>
            <Button size="sm" variant="secondary">
              সম্পাদনা
            </Button>
          </Link>
          <DeactivateButton memberId={member.id} isActive={member.isActive} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-sm text-muted">মোট জমা</p>
            <p className="mt-1 text-2xl font-semibold text-positive">
              <Money paisa={totalContributedPaisa} />
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-muted">পিতার নাম</p>
            <p className="mt-1">{member.fatherName ?? '—'}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-muted">যোগদান</p>
            <p className="mt-1">{civilDateLabel(member.joinedOnCivil)}</p>
          </CardBody>
        </Card>
      </div>

      {!member.isActive && (
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
          এই সদস্য নিষ্ক্রিয়। পুরোনো হিসাব অক্ষত আছে, নতুন মাসের চাঁদা যোগ হবে না।
        </p>
      )}

      <Card className="overflow-hidden">
        <CardHeader title="মাসভিত্তিক চাঁদার হিসাব" />
        {duePayments.length === 0 ? (
          <p className="p-8 text-center text-muted">এখনো কোনো হিসাব নেই</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50/80 text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">মাস</th>
                  <th className="px-4 py-2.5 font-medium">চাঁদা</th>
                  <th className="px-4 py-2.5 font-medium">জমা</th>
                  <th className="px-4 py-2.5 font-medium">জরিমানা</th>
                  <th className="px-4 py-2.5 font-medium">অবস্থা</th>
                </tr>
              </thead>
              <tbody>
                {duePayments.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">
                      {dueMonthLabel({ dueYear: row.year, dueMonth: row.month })}
                    </td>
                    <td className="px-4 py-2.5">
                      <Money paisa={row.amountDuePaisa} />
                    </td>
                    <td className="px-4 py-2.5">
                      <Money paisa={row.amountPaidPaisa} />
                    </td>
                    <td className="px-4 py-2.5">
                      {row.finePaisa > 0 ? (
                        <span className="text-warn">
                          <Money paisa={row.finePaisa} />
                          {row.finePaidPaisa < row.finePaisa && (
                            <span className="ml-1 text-xs">
                              (বকেয়া {toBnDigits((row.finePaisa - row.finePaidPaisa) / 100)})
                            </span>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              info={info}
              basePath={`/admin/members/${member.id}`}
              params={query}
              label="মাস"
            />
          </div>
        )}
      </Card>
    </div>
  )
}
