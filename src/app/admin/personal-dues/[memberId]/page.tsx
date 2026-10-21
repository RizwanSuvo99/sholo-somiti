import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Card, CardBody } from '@/components/ui/card'
import { StatCard } from '@/components/admin/stat-card'
import { IconArrowDown, IconCoins, IconWallet } from '@/components/ui/icon'
import { Money } from '@/components/shared/money'
import { MemberAvatar } from '@/components/shared/member-avatar'
import { formatCivilDate } from '@/lib/due-cycle'
import { getPersonalDueDetail } from '@/lib/queries/personal-dues'
import { PersonalDueForms } from '../personal-due-forms'
import { RecordList } from './record-lists'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ব্যক্তিগত পাওনা — ষোলো সমবায় সমিতি' }

export default async function PersonalDueDetailPage({
  params,
}: PageProps<'/admin/personal-dues/[memberId]'>) {
  const { memberId } = await params

  const [detail, members] = await Promise.all([
    getPersonalDueDetail(memberId),
    prisma.member.findMany({
      select: { memberCode: true, name: true, photoUrl: true, isActive: true },
      orderBy: { memberCode: 'asc' },
    }),
  ])

  // Null also covers a member who has no personal record at all, so this page
  // never shows an empty shell for somebody outside the lending book.
  if (!detail) notFound()

  const { member } = detail

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <MemberAvatar
            memberCode={member.memberCode}
            name={member.name}
            photoUrl={member.photoUrl}
            size={64}
            shape="squircle"
          />
          <div>
            <h1 className="text-xl font-bold">{member.name}</h1>
            <p className="tabular text-sm text-muted">
              {member.memberCode}
              {member.mobile && ` · ${member.mobile}`}
              {!member.isActive && ' · নিষ্ক্রিয় সদস্য'}
            </p>
            {member.fatherName && (
              <p className="text-sm text-muted">পিতা: {member.fatherName}</p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/admin/personal-dues`}
            className="inline-flex items-center rounded-xl border border-line bg-panel px-3.5 py-1.5 text-sm text-ink shadow-sm transition hover:border-brand-ring hover:bg-surface"
          >
            সব হিসাব
          </Link>
          <Link
            href={`/admin/members/${member.id}`}
            className="inline-flex items-center rounded-xl border border-line bg-panel px-3.5 py-1.5 text-sm text-ink shadow-sm transition hover:border-brand-ring hover:bg-surface"
          >
            সমিতির প্রোফাইল
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="মোট ধার দিয়েছি"
          value={<Money paisa={detail.loanPaisa} />}
          tone="sky"
          icon={<IconWallet />}
        />
        <StatCard
          label="ফেরত পেয়েছি"
          value={<Money paisa={detail.paidPaisa} />}
          tone="emerald"
          icon={<IconArrowDown />}
        />
        <StatCard
          label="এখনো বাকি"
          value={<Money paisa={detail.remainingPaisa} />}
          hint={detail.remainingPaisa === 0 ? 'পুরো টাকা শোধ হয়েছে' : undefined}
          tone={detail.remainingPaisa > 0 ? 'amber' : 'slate'}
          icon={<IconCoins />}
        />
      </div>

      <Card>
        <CardBody>
          {/* The member is fixed here, so an entry opened from this page cannot
              be saved against somebody else. */}
          <PersonalDueForms
            members={members}
            balances={{ [member.memberCode]: detail.remainingPaisa }}
            lockedMemberCode={member.memberCode}
          />
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <RecordList
          kind="loan"
          rows={detail.loans.map((loan) => ({
            id: loan.id,
            amountPaisa: loan.amountPaisa,
            date: formatCivilDate(loan.lentOn),
            note: loan.note,
          }))}
        />
        <RecordList
          kind="repayment"
          rows={detail.repayments.map((row) => ({
            id: row.id,
            amountPaisa: row.amountPaisa,
            date: formatCivilDate(row.paidOn),
            note: row.note,
          }))}
        />
      </div>
    </div>
  )
}
