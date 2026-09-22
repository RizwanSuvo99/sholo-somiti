import Link from 'next/link'
import { getPublicMembers } from '@/lib/queries/public'
import { Card } from '@/components/ui/card'
import { MemberCard } from '@/components/public/member-card'
import { formatBDT, toBnDigits } from '@/lib/money'
import { paginate } from '@/lib/paginate'
import { Pagination } from '@/components/shared/pagination'
import { Button } from '@/components/ui/button'
import { matchesSearch } from '@/lib/search'

// Dynamic: the directory is paged through the query string.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'সদস্যবৃন্দ — ষোলো সমবায় সমিতি',
  description: 'সমিতির সদস্য এবং তাঁদের মোট জমার হিসাব',
}

export default async function PublicMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const query = await searchParams
  const allMembers = await getPublicMembers()

  // Society-wide figures stay society-wide: they describe the samity, not the
  // search, so they are taken before any filtering.
  const totalContributed = allMembers.reduce((sum, m) => sum + m.totalContributedPaisa, 0)
  const paidThisMonth = allMembers.filter(
    (m) => m.currentMonthStatus === 'PAID_ON_TIME' || m.currentMonthStatus === 'PAID_LATE',
  ).length

  // Filtering in memory rather than in SQL: the directory is a few dozen people
  // and the totals above need the whole list anyway, so a second query would
  // buy nothing.
  const q = query.q?.trim() ?? ''
  const found = q ? allMembers.filter((m) => matchesSearch([m.name, m.memberCode], q)) : allMembers

  const info = paginate(found.length, query.page)
  const members = found.slice(info.skip, info.skip + info.take)

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">সদস্যবৃন্দ</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Pill tone="bg-indigo-50 text-indigo-800 ring-indigo-200 dark:bg-indigo-500/12 dark:text-indigo-300 dark:ring-indigo-400/25">
            {toBnDigits(allMembers.length)} জন সক্রিয় সদস্য
          </Pill>
          <Pill tone="bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/12 dark:text-emerald-300 dark:ring-emerald-400/25">
            সম্মিলিত জমা {formatBDT(totalContributed)}
          </Pill>
          <Pill tone="bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-500/12 dark:text-sky-300 dark:ring-sky-400/25">
            চলতি মাসে জমা {toBnDigits(paidThisMonth)} জন
          </Pill>
        </div>
        {/* A plain GET form: every result is a bookmarkable URL, paging keeps
            the query, and searching works with JavaScript switched off. Leaving
            `page` out of the form is what resets to the first page. */}
        <form role="search" className="mt-4 flex flex-wrap gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="নাম বা আইডি নম্বর দিয়ে খুঁজুন"
            aria-label="নাম বা আইডি নম্বর দিয়ে সদস্য খুঁজুন"
            className="min-w-56 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm"
          />
          <Button size="sm" variant="secondary" type="submit">
            খুঁজুন
          </Button>
          {q && (
            <Link
              href="/members"
              className="self-center text-sm text-brand underline whitespace-nowrap"
            >
              সব সদস্য
            </Link>
          )}
        </form>

        {q && (
          <p className="mt-2 text-sm text-muted">
            “{q}” — {toBnDigits(found.length)} জন পাওয়া গেছে
          </p>
        )}
      </header>

      {found.length === 0 ? (
        <Card>
          <p className="p-10 text-center text-muted">
            {q ? 'এই নাম বা আইডি নম্বরে কোনো সদস্য পাওয়া যায়নি' : 'এখনো কোনো সদস্য যোগ করা হয়নি'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <MemberCard key={member.memberCode} member={member} />
          ))}
        </div>
      )}

      {found.length > 0 && (
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
