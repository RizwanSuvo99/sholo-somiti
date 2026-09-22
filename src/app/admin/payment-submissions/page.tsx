import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardHeader } from '@/components/ui/card'
import { StatusBadge } from '@/components/shared/status-badge'
import { Money } from '@/components/shared/money'
import { dueMonthLabel, civilDateLabel, PAYMENT_MEDIUM_BN } from '@/lib/bn'
import { dbDateToCivil } from '@/lib/due-cycle'
import { previewSettlement } from '@/lib/services/submissions'
import { toBnDigits } from '@/lib/money'
import { paginate } from '@/lib/paginate'
import { Pagination } from '@/components/shared/pagination'
import { ReviewCard } from './review-card'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'জমার আবেদন — ষোলো সমবায় সমিতি' }

const TABS = [
  { key: 'PENDING', label: 'অপেক্ষমাণ' },
  { key: 'APPROVED', label: 'অনুমোদিত' },
  { key: 'REJECTED', label: 'প্রত্যাখ্যাত' },
]

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const params = await searchParams
  const { status = 'PENDING' } = params

  const where = { status: status as never }
  const total = await prisma.paymentSubmission.count({ where })
  const info = paginate(total, params.page)

  const submissions = await prisma.paymentSubmission.findMany({
    where,
    include: { member: { select: { memberCode: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    skip: info.skip,
    take: info.take,
  })

  // What each submission would settle as, so the admin sees the consequence
  // (on time or late, and any ৳200 fine) before deciding.
  // What approving each one would actually settle. A payment can clear several
  // months at once, so the admin needs to see the breakdown before deciding —
  // not just whether one month is late.
  const previews = await Promise.all(
    submissions.map(async (submission) => ({
      id: submission.id,
      plan: await previewSettlement(submission.id),
    })),
  )

  const previewOf = new Map(previews.map((p) => [p.id, p.plan]))

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">জমার আবেদন</h1>

      <nav className="flex gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/payment-submissions?status=${tab.key}`}
            className={
              tab.key === status
                ? 'rounded-lg bg-brand px-3 py-1.5 text-sm text-white'
                : 'rounded-lg px-3 py-1.5 text-sm text-ink hover:bg-brand-soft'
            }
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {submissions.length === 0 ? (
        <Card>
          <p className="p-8 text-center text-muted">কোনো আবেদন নেই</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {submissions.map((submission) => {
            const preview = previewOf.get(submission.id) ?? null
            return (
              <Card key={submission.id}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="tabular">{submission.memberCodeSnapshot}</span>
                      <span className="text-muted">·</span>
                      <span>{submission.name}</span>
                      <StatusBadge status={submission.status} kind="submission" />
                    </span>
                  }
                />
                <div className="grid gap-4 p-5 md:grid-cols-[1fr_220px]">
                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <Detail label="কোন মাসের চাঁদা" value={dueMonthLabel(submission)} />
                    <Detail
                      label="পাঠানোর তারিখ"
                      value={civilDateLabel(dbDateToCivil(submission.sendingDate))}
                    />
                    <Detail label="পরিমাণ" value={<Money paisa={submission.amountPaisa} />} />
                    <Detail label="ট্রানজেকশন আইডি" value={submission.transactionRef} />
                    <Detail
                      label="মাধ্যম"
                      value={
                        submission.paymentMedium === 'MOBILE_BANKING'
                          ? `${PAYMENT_MEDIUM_BN[submission.paymentMedium]} — ${submission.mobileBankingProvider === 'BKASH' ? 'বিকাশ' : 'নগদ'} ${toBnDigits(submission.mobileBankingNumber ?? '')}`
                          : `${PAYMENT_MEDIUM_BN[submission.paymentMedium]} — ${submission.bankName ?? ''}`
                      }
                    />
                    {preview && (
                      <Detail
                        label="মোট বকেয়া"
                        value={<Money paisa={preview.totalOwedPaisa} />}
                      />
                    )}
                    {submission.rejectionReason && (
                      <Detail label="প্রত্যাখ্যানের কারণ" value={submission.rejectionReason} />
                    )}
                  </dl>

                  <a
                    href={submission.screenshotUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={submission.screenshotUrl}
                      alt="লেনদেনের স্ক্রিনশট"
                      className="h-48 w-full rounded-lg border border-line object-cover"
                    />
                    <span className="mt-1 block text-center text-xs text-brand underline">
                      বড় করে দেখুন
                    </span>
                  </a>
                </div>

                {submission.status === 'PENDING' && (
                  <ReviewCard
                    submissionId={submission.id}
                    plan={preview}
                    dueMonthLabel={dueMonthLabel(submission)}
                  />
                )}
              </Card>
            )
          })}

          <Card>
            <Pagination
              info={info}
              basePath="/admin/payment-submissions"
              params={params}
              label="আবেদন"
            />
          </Card>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
