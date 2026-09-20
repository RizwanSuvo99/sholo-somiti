import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPublicMemberProfile } from '@/lib/queries/public'
import { normalizeMemberCode } from '@/lib/member-code'
import { Card, CardHeader } from '@/components/ui/card'
import { StatTile } from '@/components/public/stat-tile'
import { MemberAvatar } from '@/components/shared/member-avatar'
import { IconAlert, IconCheck, IconWallet } from '@/components/ui/icon'
import { StatusBadge } from '@/components/shared/status-badge'
import { Money } from '@/components/shared/money'
import { formatBDT, toBnDigits } from '@/lib/money'
import { paginate } from '@/lib/paginate'
import { Pagination } from '@/components/shared/pagination'
import { civilDateLabel, dueMonthLabel } from '@/lib/bn'

// Dynamic rather than cached: the history table is paged through the query
// string, so each request renders its own page.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps<'/members/[code]'>) {
  const { code } = await params
  const profile = await getPublicMemberProfile(normalizeMemberCode(decodeURIComponent(code)))
  return {
    title: profile ? `${profile.name} — ষোলো সমবায় সমিতি` : 'সদস্য পাওয়া যায়নি',
  }
}

export default async function PublicMemberProfilePage({
  params,
  searchParams,
}: PageProps<'/members/[code]'>) {
  const { code } = await params
  const query = await searchParams
  const profile = await getPublicMemberProfile(normalizeMemberCode(decodeURIComponent(code)))
  if (!profile) notFound()

  const paidMonths = profile.history.filter(
    (row) => row.status === 'PAID_ON_TIME' || row.status === 'PAID_LATE',
  ).length

  const info = paginate(profile.history.length, query.page)
  const history = profile.history.slice(info.skip, info.skip + info.take)

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/members" className="text-sm text-brand underline">
        ← সব সদস্য
      </Link>

      <header className="mt-4 mb-6 flex items-center gap-4">
        <MemberAvatar
          memberCode={profile.memberCode}
          name={profile.name}
          photoUrl={profile.photoUrl}
          size={96}
          shape="squircle"
          ring="ring-2 ring-white"
          className="shadow-md"
        />
        <div>
          <h1 className="text-2xl font-bold">{profile.name}</h1>
          <p className="tabular text-sm text-muted">{profile.memberCode}</p>
          <p className="text-sm text-muted">সদস্য {civilDateLabel(profile.joinedOn)} থেকে</p>
        </div>
      </header>

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          tone="emerald"
          label="মোট জমা"
          value={formatBDT(profile.totalContributedPaisa)}
          icon={<IconWallet className="size-5" />}
        />
        <StatTile
          tone="sky"
          label="পরিশোধিত মাস"
          value={toBnDigits(paidMonths)}
          icon={<IconCheck className="size-5" />}
        />
        <StatTile
          tone={profile.outstandingFinePaisa > 0 ? 'rose' : 'slate'}
          label="বকেয়া জরিমানা"
          value={formatBDT(profile.outstandingFinePaisa)}
          icon={<IconAlert className="size-5" />}
          hint={
            profile.totalFinePaidPaisa > 0
              ? `পরিশোধিত জরিমানা ${formatBDT(profile.totalFinePaidPaisa)}`
              : undefined
          }
        />
      </section>

      <Card className="overflow-hidden">
        <CardHeader title="মাসভিত্তিক হিসাব" />
        {profile.history.length === 0 ? (
          <p className="p-8 text-center text-muted">এখনো কোনো হিসাব নেই</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50/80 dark:bg-white/4 text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">মাস</th>
                  <th className="px-4 py-2.5 font-medium">চাঁদা</th>
                  <th className="px-4 py-2.5 font-medium">জমা</th>
                  <th className="px-4 py-2.5 font-medium">জরিমানা</th>
                  <th className="px-4 py-2.5 font-medium">অবস্থা</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={`${row.year}-${row.month}`} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {dueMonthLabel({ dueYear: row.year, dueMonth: row.month })}
                    </td>
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
            <Pagination
              info={info}
              basePath={`/members/${profile.memberCode}`}
              params={query}
              label="মাস"
            />
          </div>
        )}
      </Card>
    </main>
  )
}
