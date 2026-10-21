import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { StatCard } from '@/components/admin/stat-card'
import { IconCoins, IconUsers, IconArrowDown, IconWallet } from '@/components/ui/icon'
import { Money } from '@/components/shared/money'
import { MemberAvatar } from '@/components/shared/member-avatar'
import { civilDateLabel } from '@/lib/bn'
import { toBnDigits } from '@/lib/money'
import { getPersonalDueBook } from '@/lib/queries/personal-dues'
import { PersonalDueForms } from './personal-due-forms'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ব্যক্তিগত পাওনা — ষোলো সমবায় সমিতি' }

/**
 * The admin's private lending book.
 *
 * Separate from every society screen on purpose: it reads only
 * `personal_loans` / `personal_repayments`, writes nothing the society reads,
 * and borrows the member roster for nothing but the ID and name the admin
 * already recognises.
 */
export default async function PersonalDuesPage() {
  const [{ rows, summary }, members] = await Promise.all([
    getPersonalDueBook(),
    // Inactive members are included: leaving the society does not clear a
    // personal debt, so they must stay selectable.
    prisma.member.findMany({
      select: { memberCode: true, name: true, photoUrl: true, isActive: true },
      orderBy: { memberCode: 'asc' },
    }),
  ])

  const balances = Object.fromEntries(rows.map((row) => [row.memberCode, row.remainingPaisa]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">ব্যক্তিগত পাওনা</h1>
        <p className="mt-1 text-sm text-muted">
          আপনার নিজের টাকা, যা সদস্যদের ধার দিয়েছেন। এই হিসাব সমিতির হিসাব থেকে সম্পূর্ণ আলাদা —
          এখানে যা লিখবেন তা সমিতির আয়-ব্যয়, চাঁদা বা ব্যালেন্সে কোনো প্রভাব ফেলবে না।
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="যাঁদের কাছে পাওনা আছে"
          value={`${toBnDigits(summary.debtorCount)} জন`}
          hint={
            summary.memberCount > summary.debtorCount
              ? `শোধ করেছেন ${toBnDigits(summary.memberCount - summary.debtorCount)} জন`
              : undefined
          }
          tone="indigo"
          icon={<IconUsers />}
        />
        <StatCard
          label="মোট ধার দিয়েছি"
          value={<Money paisa={summary.totalReceivablePaisa} />}
          tone="sky"
          icon={<IconWallet />}
        />
        <StatCard
          label="ফেরত পেয়েছি"
          value={<Money paisa={summary.totalCollectedPaisa} />}
          tone="emerald"
          icon={<IconArrowDown />}
        />
        <StatCard
          label="এখনো বাকি"
          value={<Money paisa={summary.totalOutstandingPaisa} />}
          tone="amber"
          icon={<IconCoins />}
        />
      </div>

      <PersonalDueForms members={members} balances={balances} />

      <Card className="overflow-hidden">
        <CardHeader title={`হিসাবের তালিকা (${toBnDigits(rows.length)} জন)`} />

        {rows.length === 0 ? (
          <CardBody>
            <p className="py-6 text-center text-muted">
              এখনো কিছু যোগ করা হয়নি। উপরের “নতুন ধার যোগ করুন” দিয়ে শুরু করুন।
            </p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50/80 text-left text-xs tracking-wide text-muted uppercase dark:bg-white/4">
                <tr>
                  <th className="px-4 py-2.5 font-medium">সদস্য</th>
                  <th className="px-4 py-2.5 font-medium">মোট ধার</th>
                  <th className="px-4 py-2.5 font-medium">ফেরত</th>
                  <th className="px-4 py-2.5 font-medium">বাকি</th>
                  <th className="px-4 py-2.5 font-medium">সর্বশেষ</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    <span className="sr-only">বিস্তারিত</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => (
                  <tr key={row.memberId} className="border-b border-line last:border-0 hover:bg-surface">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <MemberAvatar
                          memberCode={row.memberCode}
                          name={row.name}
                          photoUrl={row.photoUrl}
                          size={32}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{row.name}</span>
                          <span className="block tabular text-xs text-muted">
                            {row.memberCode}
                            {!row.isActive && ' · নিষ্ক্রিয়'}
                          </span>
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Money paisa={row.loanPaisa} />
                      {row.loanCount > 1 && (
                        <span className="ml-1 text-xs text-muted">
                          ({toBnDigits(row.loanCount)} বারে)
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-2.5 whitespace-nowrap text-positive">
                      <Money paisa={row.paidPaisa} />
                      {row.repaymentCount > 0 && (
                        <span className="ml-1 text-xs text-muted">
                          ({toBnDigits(row.repaymentCount)} কিস্তি)
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {row.remainingPaisa > 0 ? (
                        <span className="font-semibold text-amber-700 dark:text-amber-300">
                          <Money paisa={row.remainingPaisa} />
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 ring-inset dark:bg-emerald-500/12 dark:text-emerald-300 dark:ring-emerald-400/25">
                          শোধ হয়েছে
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                      {row.lastActivity ? civilDateLabel(row.lastActivity) : '—'}
                    </td>

                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/admin/personal-dues/${row.memberId}`}
                        className="text-brand hover:underline"
                      >
                        বিস্তারিত
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
