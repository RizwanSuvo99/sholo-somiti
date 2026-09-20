import Link from 'next/link'
import { getPublicSummary } from '@/lib/queries/public'
import { StatTile } from '@/components/public/stat-tile'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import {
  IconAlert,
  IconCalendar,
  IconCoins,
  IconGift,
  IconReceipt,
  IconUsers,
  IconWallet,
} from '@/components/ui/icon'
import { BankDetails } from '@/components/public/bank-details'
import { formatBDT, toBnDigits } from '@/lib/money'
import { civilDateLabel, dueMonthLabel } from '@/lib/bn'
import { instantToDhakaCivil } from '@/lib/due-cycle'

// Recomputed at most once a minute: the figures change only when an admin
// approves something, and every visitor should not trigger a fresh aggregate.
export const revalidate = 60

export const metadata = {
  title: 'ষোলো সমবায় সমিতি',
  description: 'সমিতির তহবিল, আয়-ব্যয় ও সদস্যদের হিসাব — সবার জন্য উন্মুক্ত',
}

export default async function HomePage() {
  const summary = await getPublicSummary()
  const current = { dueYear: summary.currentDue.dueYear, dueMonth: summary.currentDue.dueMonth }
  const deadline = instantToDhakaCivil(new Date(summary.currentDue.deadlineIso))

  const collectedPercent =
    summary.activeMembers > 0
      ? Math.round((summary.currentDue.paidCount / summary.activeMembers) * 100)
      : 0

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      {/* Hero */}
      <section className="mb-8 overflow-hidden rounded-3xl border border-emerald-200/60 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-8 text-white shadow-lift sm:p-10">
        <div className="relative">
          <p className="text-sm font-medium text-emerald-100">সবার জন্য উন্মুক্ত হিসাব</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">ষোলো সমবায় সমিতি</h1>
          <p className="mt-3 max-w-xl text-emerald-50/90">
            কে কত জমা দিয়েছেন, তহবিলে এখন কত আছে, কোথায় খরচ হয়েছে — সব তথ্য যেকোনো সদস্য
            এখান থেকেই দেখতে পারবেন।
          </p>

          <div className="mt-6 inline-flex flex-col gap-1 rounded-2xl bg-white/15 px-6 py-4 ring-1 ring-white/25 backdrop-blur-sm">
            <span className="text-sm text-emerald-50">বর্তমান তহবিল</span>
            <span className="text-4xl font-bold tracking-tight tabular">
              {formatBDT(summary.balancePaisa)}
            </span>
            <span className="text-xs text-emerald-100/90">
              মোট আয় {formatBDT(summary.totalCollectedPaisa)} − মোট ব্যয়{' '}
              {formatBDT(summary.totalExpensePaisa)}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/pay/submit">
              <span className="inline-flex items-center rounded-xl bg-white px-5 py-2.5 font-medium text-emerald-800 shadow-lg transition hover:bg-emerald-50">
                চাঁদা জমার তথ্য দিন
              </span>
            </Link>
            <Link href="/accounts">
              <span className="inline-flex items-center rounded-xl bg-white/15 px-5 py-2.5 font-medium text-white ring-1 ring-white/30 transition hover:bg-white/25">
                বিস্তারিত হিসাব
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Headline figures */}
      <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          tone="sky"
          label="মোট আদায়কৃত চাঁদা"
          value={formatBDT(summary.totalDuePaisa)}
          icon={<IconCoins className="size-5" />}
        />
        <StatTile
          tone="amber"
          label="আদায়কৃত জরিমানা"
          value={formatBDT(summary.totalFinePaisa)}
          icon={<IconAlert className="size-5" />}
        />
        <StatTile
          tone="violet"
          label="অন্যান্য আয়"
          value={formatBDT(summary.totalOtherIncomePaisa)}
          icon={<IconGift className="size-5" />}
        />
        <StatTile
          tone="rose"
          label="মোট ব্যয়"
          value={formatBDT(summary.totalExpensePaisa)}
          icon={<IconReceipt className="size-5" />}
        />
      </section>

      {/* This month */}
      <section className="mb-8 grid gap-4 md:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardBody>
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-semibold">
                <span className="grid size-8 place-items-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                  <IconCalendar className="size-4" />
                </span>
                {dueMonthLabel(current)} মাসের চাঁদা
              </h2>
              {summary.currentDue.amountPaisa !== null && (
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-500/12 dark:text-indigo-300 dark:ring-indigo-400/25 ring-inset">
                  {formatBDT(summary.currentDue.amountPaisa)}
                </span>
              )}
            </div>

            <div className="mt-5">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted">জমা দিয়েছেন</span>
                <span className="font-medium tabular">
                  {toBnDigits(summary.currentDue.paidCount)} / {toBnDigits(summary.activeMembers)} জন
                </span>
              </div>
              <div
                className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/8"
                role="progressbar"
                aria-valuenow={collectedPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="এই মাসে জমা দেওয়া সদস্যের হার"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                  style={{ width: `${collectedPercent}%` }}
                />
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
              <Mini label="পরিশোধিত" value={summary.currentDue.paidCount} tone="text-emerald-700 bg-emerald-50 dark:bg-emerald-500/12 dark:text-emerald-300" />
              <Mini label="বাকি" value={summary.currentDue.pendingCount} tone="text-amber-700 bg-amber-50 dark:bg-amber-500/12 dark:text-amber-300" />
              <Mini label="অপরিশোধিত" value={summary.currentDue.unpaidCount} tone="text-rose-700 bg-rose-50 dark:bg-rose-500/12 dark:text-rose-300" />
            </dl>

            <p className="mt-4 flex items-center gap-2 text-sm text-muted">
              <IconCalendar className="size-4" />
              শেষ তারিখ {civilDateLabel(deadline)} — এরপরে ৳২০০ জরিমানা
            </p>
          </CardBody>
        </Card>

        <div className="grid gap-4">
          <StatTile
            tone="indigo"
            label="সক্রিয় সদস্য"
            value={`${toBnDigits(summary.activeMembers)} জন`}
            icon={<IconUsers className="size-5" />}
            hint="সবার জমার হিসাব দেখতে সদস্যবৃন্দ পাতায় যান"
          />
          <Card>
            <CardBody className="flex h-full flex-col justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/25">
                  <IconWallet className="size-5" />
                </span>
                <div>
                  <h2 className="font-semibold">চাঁদা পাঠিয়েছেন?</h2>
                  <p className="mt-1 text-sm text-muted">
                    টাকা পাঠানোর পর লেনদেনের তথ্য জমা দিন। প্রশাসক যাচাই করলে তা হিসাবে যুক্ত হবে।
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/pay/submit">
                  <Button size="sm">তথ্য জমা দিন</Button>
                </Link>
                <Link href="/members">
                  <Button size="sm" variant="secondary">
                    সদস্যদের হিসাব
                  </Button>
                </Link>
              </div>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Where to send the money. Last, because someone reading the fund
          figures is checking on the society; someone who has decided to pay
          scrolls for the account. */}
      <section>
        <BankDetails formHref="/pay/submit" />
      </section>
    </main>
  )
}

function Mini({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-xl px-2 py-3 ${tone}`}>
      <dt className="text-xs opacity-80">{label}</dt>
      <dd className="mt-0.5 text-xl font-bold tabular">{toBnDigits(value)}</dd>
    </div>
  )
}
