import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toBnDigits } from '@/lib/money'
import { paginate } from '@/lib/paginate'
import { Pagination } from '@/components/shared/pagination'
import { dbDateToCivil, formatCivilDate } from '@/lib/due-cycle'
import { MembersTable } from './members-table'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'সদস্য — ষোলো সমবায় সমিতি' }

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>
}) {
  const params = await searchParams
  const { q = '', status = 'active' } = params

  const where = {
    ...(status === 'all' ? {} : { isActive: status !== 'inactive' }),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { memberCode: { contains: q, mode: 'insensitive' as const } },
            { mobile: { contains: q } },
          ],
        }
      : {}),
  }

  const total = await prisma.member.count({ where })
  const info = paginate(total, params.page)

  const members = await prisma.member.findMany({
    where,
    orderBy: { memberCode: 'asc' },
    skip: info.skip,
    take: info.take,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">সদস্য ({toBnDigits(total)})</h1>
        <Link href="/admin/members/new">
          <Button size="sm">নতুন সদস্য</Button>
        </Link>
      </div>

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="নাম, আইডি বা মোবাইল"
          className="min-w-48 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm"
        />
        <select
          name="status"
          defaultValue={status}
          className="rounded-lg border border-line bg-panel px-3 py-2 text-sm"
        >
          <option value="active">সক্রিয়</option>
          <option value="inactive">নিষ্ক্রিয়</option>
          <option value="all">সবাই</option>
        </select>
        <Button size="sm" variant="secondary" type="submit">
          খুঁজুন
        </Button>
      </form>

      <Card className="overflow-hidden">
        {members.length === 0 ? (
          <p className="p-8 text-center text-muted">কোনো সদস্য পাওয়া যায়নি</p>
        ) : (
          <>
            <MembersTable
              members={members.map((member) => ({
                id: member.id,
                memberCode: member.memberCode,
                name: member.name,
                fatherName: member.fatherName ?? '',
                mobile: member.mobile ?? '',
                email: member.email ?? '',
                // Serialise the date here: a Date cannot cross into a Client
                // Component, and the civil day is what the editor works with.
                joinedOn: formatCivilDate(dbDateToCivil(member.joinedOn)),
                photoUrl: member.photoUrl,
                photoPublicId: member.photoPublicId,
                isActive: member.isActive,
              }))}
            />
            <Pagination info={info} basePath="/admin/members" params={params} label="জন" />
          </>
        )}
      </Card>

      <p className="text-xs text-muted">
        “সম্পাদনা” চাপলে একটি উইন্ডোতে তথ্য পরিবর্তন করা যাবে। আইডি নম্বর পরিবর্তন করা যায় না —
        পুরোনো হিসাব এই নম্বরের সাথে যুক্ত।
      </p>
    </div>
  )
}
