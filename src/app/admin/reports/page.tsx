import { Card, CardHeader } from '@/components/ui/card'
import { listSubmissionCycles } from '@/lib/queries/reports'
import { civilDateLabel, dueMonthLabel } from '@/lib/bn'
import { dueMonthKey } from '@/lib/due-cycle'
import { toBnDigits } from '@/lib/money'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'মাসিক রিপোর্ট — ষোলো সমবায় সমিতি' }

const DOWNLOAD_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-panel ' +
  'px-3.5 py-1.5 text-sm font-medium text-ink shadow-sm transition duration-150 ' +
  'hover:border-brand-ring hover:bg-surface ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

export default async function ReportsPage() {
  const cycles = await listSubmissionCycles()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">মাসিক জমার রিপোর্ট</h1>
        <p className="mt-1 text-sm text-muted">
          প্রতি মাসের হিসাব ২১ তারিখ থেকে পরের মাসের ২০ তারিখ পর্যন্ত। যে মাস বেছে নেবেন, সেই সময়ের
          মধ্যে কে টাকা পাঠিয়েছেন আর কে পাঠাননি — সবার তথ্য এক্সেল ফাইলে পাবেন।
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="কোন মাসের রিপোর্ট চান?" />
        {cycles.length === 0 ? (
          <p className="p-8 text-center text-muted">এখনো কোনো হিসাব তৈরি হয়নি।</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50/80 text-left text-xs tracking-wide text-muted uppercase dark:bg-white/4">
                <tr>
                  <th className="px-4 py-2.5 font-medium">মাস</th>
                  <th className="px-4 py-2.5 font-medium">সময়সীমা</th>
                  <th className="px-4 py-2.5 font-medium">সদস্য</th>
                  <th className="px-4 py-2.5 font-medium">জমা দিয়েছেন</th>
                  <th className="px-4 py-2.5 font-medium">জমা দেননি</th>
                  <th className="px-4 py-2.5 font-medium">
                    <span className="sr-only">ডাউনলোড</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((cycle) => (
                  <tr key={dueMonthKey(cycle.cycle)} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-medium">{dueMonthLabel(cycle.cycle)}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {civilDateLabel(cycle.startCivil)} — {civilDateLabel(cycle.endCivil)}
                    </td>
                    <td className="px-4 py-2.5 tabular">{toBnDigits(cycle.rosterCount)}</td>
                    <td className="px-4 py-2.5 tabular">
                      {cycle.submittedCount > 0 ? (
                        <span className="font-medium text-emerald-700 dark:text-emerald-300">
                          {toBnDigits(cycle.submittedCount)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 tabular">
                      {cycle.missingCount > 0 ? (
                        <span className="font-medium text-amber-700 dark:text-amber-300">
                          {toBnDigits(cycle.missingCount)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <a
                        href={`/api/admin/reports/submissions?cycle=${dueMonthKey(cycle.cycle)}`}
                        className={DOWNLOAD_CLASS}
                      >
                        এক্সেল ডাউনলোড
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="space-y-2 rounded-xl border border-line bg-panel px-4 py-3 text-sm text-muted">
        <p>
          <span className="font-medium text-ink">মনে রাখবেন:</span> যে মাসগুলোর চাঁদা প্রশাসক নিজে
          যোগ করেছেন, সেই মাসে কেউ ফর্ম পূরণ করেননি — তাই রিপোর্টে সবাই “জমা দেননি” দেখাবে এবং ছবি,
          লেনদেন আইডি ও তারিখের ঘর খালি থাকবে। সদস্যদের নিজের জমা দেওয়া শুরু হয়েছে অক্টোবর ২০২৬ থেকে।
        </p>
        <p>
          ফাইলে প্রমাণের ছবির লিংক থাকে — লিংক যার কাছে যাবে সে ছবিটি দেখতে পারবে। তাই ফাইলটি সমিতির
          বাইরে শেয়ার করবেন না।
        </p>
      </div>
    </div>
  )
}
