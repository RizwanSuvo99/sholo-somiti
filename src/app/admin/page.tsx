import Link from 'next/link'
import { getDashboard } from '@/lib/queries/dashboard'
import { StatCard } from '@/components/admin/stat-card'
import { StatHint } from '@/components/public/stat-tile'
import { Alert } from '@/components/ui/alert'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { formatBDT, toBnDigits } from '@/lib/money'
import { dueMonthLabel } from '@/lib/bn'
import {
  IconAlert,
  IconCalendar,
  IconCoins,
  IconGift,
  IconReceipt,
  IconUsers,
  IconWallet,
} from '@/components/ui/icon'
import { RunRolloverButton } from './run-rollover-button'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ড্যাশবোর্ড — ষোলো সমবায় সমিতি' }

export default async function DashboardPage() {
  const data = await getDashboard()
  const current = { dueMonth: data.currentDue.dueMonth, dueYear: data.currentDue.dueYear }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">ড্যাশবোর্ড</h1>
        <RunRolloverButton />
      </div>

      {data.missingDueSettings.length > 0 && (
        <Alert tone="warn" title="চাঁদার পরিমাণ নির্ধারণ করা হয়নি">
          {data.missingDueSettings.map(dueMonthLabel).join(', ')} মাসের চাঁদার পরিমাণ এখনো দেওয়া হয়নি।{' '}
          <Link href="/admin/dues/settings" className="underline">
            এখনই নির্ধারণ করুন
          </Link>
        </Alert>
      )}

      {data.pendingSubmissionCount > 0 && (
        <Alert tone="info">
          {toBnDigits(data.pendingSubmissionCount)}টি জমার আবেদন যাচাইয়ের অপেক্ষায় আছে।{' '}
          <Link href="/admin/payment-submissions" className="underline">
            দেখুন
          </Link>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          tone="emerald"
          label="বর্তমান তহবিল"
          value={formatBDT(data.balancePaisa)}
          icon={<IconWallet className="size-5" />}
        />
        <StatCard
          tone="indigo"
          label="সক্রিয় সদস্য"
          value={`${toBnDigits(data.activeMembers)} জন`}
          icon={<IconUsers className="size-5" />}
        />
        <StatCard
          tone="sky"
          label="মোট আদায়কৃত চাঁদা"
          value={formatBDT(data.totalDueCollectedPaisa)}
          icon={<IconCoins className="size-5" />}
        />
        <StatCard
          tone="amber"
          label="আদায়কৃত জরিমানা"
          value={formatBDT(data.totalFinesCollectedPaisa)}
          icon={<IconAlert className="size-5" />}
          hint={
            data.finesOutstandingPaisa > 0 ? (
              <StatHint label="বকেয়া জরিমানা" value={formatBDT(data.finesOutstandingPaisa)} />
            ) : undefined
          }
        />
        <StatCard
          tone="violet"
          label="অন্যান্য আয়"
          value={formatBDT(data.totalOtherIncomePaisa)}
          icon={<IconGift className="size-5" />}
        />
        <StatCard
          tone="rose"
          label="মোট ব্যয়"
          value={formatBDT(data.totalExpensePaisa)}
          icon={<IconReceipt className="size-5" />}
        />
      </div>

      <Card>
        <CardHeader
          title={`${dueMonthLabel(current)} মাসের আদায়`}
          accent={
            <span className="grid size-7 place-items-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
              <IconCalendar className="size-4" />
            </span>
          }
        />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          <Mini label="পরিশোধিত" value={data.currentDue.paidCount} tone="bg-emerald-50 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-300" />
          <Mini label="বাকি" value={data.currentDue.pendingCount} tone="bg-amber-50 text-amber-700 dark:bg-amber-500/12 dark:text-amber-300" />
          <Mini
            label="অপরিশোধিত"
            value={data.currentDue.unpaidCount}
            tone="bg-rose-50 text-rose-700 dark:bg-rose-500/12 dark:text-rose-300"
          />
        </CardBody>
      </Card>
    </div>
  )
}

function Mini({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-xl px-4 py-3 ${tone}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="mt-0.5 text-2xl font-bold tabular">{toBnDigits(value)}</p>
    </div>
  )
}
