import type { ReactNode } from 'react'
import Link from 'next/link'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { MemberAvatar } from '@/components/shared/member-avatar'
import { StatusBadge } from '@/components/shared/status-badge'
import { Money } from '@/components/shared/money'
import { getSubmissionReceipt } from '@/lib/queries/public'
import { civilDateLabel, dueMonthLabel, PAYMENT_MEDIUM_BN, PROVIDER_BN } from '@/lib/bn'
import { instantToDhakaCivil } from '@/lib/due-cycle'
import { toBnDigits } from '@/lib/money'

// Reads a submission by id, so it cannot be prerendered or cached.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'জমা হয়েছে — ষোলো সমবায় সমিতি',
  // A receipt carrying someone's transaction reference has no business in a
  // search index, even though the link itself is unguessable.
  robots: 'noindex, nofollow',
}

export default async function SubmitSuccessPage({
  searchParams,
}: PageProps<'/pay/submit/success'>) {
  const { ref } = await searchParams
  const receipt = typeof ref === 'string' ? await getSubmissionReceipt(ref) : null

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <Card>
        <CardBody className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-positive/10 text-2xl text-positive">
            ✓
          </div>
          <h1 className="text-xl font-bold">আপনার তথ্য জমা হয়েছে</h1>
          <p className="text-sm text-muted">
            প্রশাসক যাচাই করার পর এটি সমিতির হিসাবে যুক্ত হবে। যাচাই না হওয়া পর্যন্ত এটি
            পরিশোধিত হিসেবে গণ্য হবে না।
          </p>
        </CardBody>
      </Card>

      {receipt && (
        <Card className="mt-5 overflow-hidden">
          <CardHeader
            title={
              <span className="flex flex-wrap items-center gap-2">
                <span>আপনার জমা দেওয়া তথ্য</span>
                <StatusBadge status={receipt.status} />
              </span>
            }
          />

          {/* The photo is here for one reason: picking the wrong ID from the
              dropdown is the mistake this form invites, and seeing the face
              beside the entry is how a member catches it. */}
          <div className="flex items-center gap-4 border-b border-line px-5 py-4">
            <MemberAvatar
              memberCode={receipt.memberCode}
              name={receipt.name}
              photoUrl={receipt.photoUrl}
              size={72}
              shape="squircle"
              ring="ring-2 ring-white"
              className="shadow-md"
            />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{receipt.name}</p>
              <p className="tabular text-sm text-muted">{receipt.memberCode}</p>
              <p className="text-sm text-muted">
                জমা দেওয়ার তারিখ {civilDateLabel(instantToDhakaCivil(receipt.submittedAt))}
              </p>
            </div>
          </div>

          <dl className="grid gap-x-6 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2">
            <Detail label="কোন মাসের চাঁদা" value={dueMonthLabel(receipt)} />
            <Detail label="টাকা পাঠানোর তারিখ" value={civilDateLabel(receipt.sendingDate)} />
            <Detail label="পরিমাণ" value={<Money paisa={receipt.amountPaisa} />} />
            <Detail
              label="ট্রানজেকশন আইডি"
              value={<span className="tabular break-all">{receipt.transactionRef}</span>}
            />
            <Detail label="পেমেন্ট মাধ্যম" value={PAYMENT_MEDIUM_BN[receipt.paymentMedium]} />
            {receipt.paymentMedium === 'MOBILE_BANKING' ? (
              <Detail
                label="মোবাইল ব্যাংকিং"
                value={
                  <>
                    {PROVIDER_BN[receipt.mobileBankingProvider ?? ''] ?? ''}{' '}
                    <span className="tabular">
                      {toBnDigits(receipt.mobileBankingNumber ?? '')}
                    </span>
                  </>
                }
              />
            ) : (
              <Detail label="ব্যাংকের নাম" value={receipt.bankName ?? '—'} />
            )}
            {receipt.rejectionReason && (
              <Detail label="প্রত্যাখ্যানের কারণ" value={receipt.rejectionReason} />
            )}
          </dl>

          <div className="border-t border-line px-5 py-4">
            <p className="mb-2 text-sm text-muted">লেনদেনের স্ক্রিনশট</p>
            <a href={receipt.screenshotUrl} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receipt.screenshotUrl}
                alt="লেনদেনের স্ক্রিনশট"
                className="max-h-72 w-full rounded-lg border border-line object-contain"
              />
              <span className="mt-1 block text-center text-xs text-brand underline">
                বড় করে দেখুন
              </span>
            </a>
          </div>

          <p className="border-t border-line px-5 py-3 text-xs text-muted">
            ভুল কিছু দেখলে সমিতির প্রশাসকের সাথে যোগাযোগ করুন — যাচাই হওয়ার আগে সংশোধন করা
            যাবে।
          </p>
        </Card>
      )}

      <div className="mt-5 flex flex-wrap justify-center gap-4 text-sm">
        <Link href="/pay/submit" className="text-brand underline">
          আরেকটি তথ্য জমা দিন
        </Link>
        <Link href="/" className="text-brand underline">
          হোম পেজে ফিরুন
        </Link>
      </div>
    </main>
  )
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
