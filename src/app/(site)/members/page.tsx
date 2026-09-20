import { getPublicMembers } from '@/lib/queries/public'
import { Card } from '@/components/ui/card'
import { MemberCard } from '@/components/public/member-card'
import { formatBDT, toBnDigits } from '@/lib/money'
import { paginate } from '@/lib/paginate'
import { Pagination } from '@/components/shared/pagination'

// Dynamic: the directory is paged through the query string.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'সদস্যবৃন্দ — ষোলো সমবায় সমিতি',
  description: 'সমিতির সদস্য এবং তাঁদের মোট জমার হিসাব',
}

export default async function PublicMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const query = await searchParams
  const allMembers = await getPublicMembers()

  // Society-wide figures stay society-wide; only the cards below are paged.
  const totalContributed = allMembers.reduce((sum, m) => sum + m.totalContributedPaisa, 0)
  const paidThisMonth = allMembers.filter(
    (m) => m.currentMonthStatus === 'PAID_ON_TIME' || m.currentMonthStatus === 'PAID_LATE',
  ).length

  const info = paginate(allMembers.length, query.page)
  const members = allMembers.slice(info.skip, info.skip + info.take)

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">সদস্যবৃন্দ</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Pill tone="bg-indigo-50 text-indigo-800 ring-indigo-200">
            {toBnDigits(allMembers.length)} জন সক্রিয় সদস্য
          </Pill>
          <Pill tone="bg-emerald-50 text-emerald-800 ring-emerald-200">
            সম্মিলিত জমা {formatBDT(totalContributed)}
          </Pill>
          <Pill tone="bg-sky-50 text-sky-800 ring-sky-200">
            চলতি মাসে জমা {toBnDigits(paidThisMonth)} জন
          </Pill>
        </div>
      </header>

      {allMembers.length === 0 ? (
        <Card>
          <p className="p-10 text-center text-muted">এখনো কোনো সদস্য যোগ করা হয়নি</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <MemberCard key={member.memberCode} member={member} />
          ))}
        </div>
      )}

      {allMembers.length > 0 && (
        <Card className="mt-4">
          <Pagination info={info} basePath="/members" params={query} label="জন" />
        </Card>
      )}
    </main>
  )
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-3 py-1 font-medium ring-1 ring-inset ${tone}`}>{children}</span>
  )
}
