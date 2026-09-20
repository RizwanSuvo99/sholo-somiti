import Link from 'next/link'
import { BANK_FIELDS } from '@/lib/society'
import { CopyButton } from './copy-button'
import { cn } from '@/lib/cn'

/**
 * The society's bank account, for members sending their dues.
 *
 * Account, routing and SWIFT values are marked `verbatim` and render in Latin
 * digits with `select-all`, because a member will retype or copy them into a
 * banking app. Rendering them in Bengali numerals like the rest of the interface
 * would invite a mistyped transfer.
 */
export function BankDetails({
  compact = false,
  className,
  formHref,
}: {
  compact?: boolean
  className?: string
  /**
   * Where the submission form lives, when it is not on this page. Omitted on
   * the payment page itself, where the form is directly below.
   */
  formHref?: string
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-sky-200/70 bg-gradient-to-br from-sky-50 to-indigo-50 dark:border-sky-400/25 dark:from-sky-500/10 dark:to-indigo-500/10',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-sky-200/60 dark:border-sky-400/20 px-5 py-3">
        <h2 className="font-semibold text-sky-900 dark:text-sky-200">সমিতির ব্যাংক হিসাব</h2>
        <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium text-sky-800 dark:bg-white/10 dark:text-sky-200">
          এই হিসাবে টাকা পাঠান
        </span>
      </div>

      <dl className={cn('divide-y divide-sky-200/50 dark:divide-sky-400/15', compact && 'text-sm')}>
        {BANK_FIELDS.map((field) => (
          <div key={field.label} className="flex items-center gap-3 px-5 py-2.5">
            <dt className="w-28 shrink-0 text-sm text-sky-800/80 dark:text-sky-300/80">{field.label}</dt>
            <dd
              className={cn(
                'min-w-0 flex-1 font-medium break-words text-sky-950 dark:text-sky-100',
                field.verbatim && 'tabular tracking-wide select-all',
              )}
            >
              {field.value}
            </dd>
            {field.verbatim && <CopyButton value={field.value} label={field.label} />}
          </div>
        ))}
      </dl>

      <p className="border-t border-sky-200/60 dark:border-sky-400/20 px-5 py-3 text-xs text-sky-800/80 dark:text-sky-300/80">
        টাকা পাঠানোর পর অবশ্যই{' '}
        {formHref ? (
          <Link href={formHref} className="font-medium underline">
            লেনদেনের তথ্য ও স্ক্রিনশট জমা দিন
          </Link>
        ) : (
          <span>নিচের ফরমে লেনদেনের তথ্য ও স্ক্রিনশট জমা দিন</span>
        )}{' '}
        — তা না করলে চাঁদা হিসাবে যুক্ত হবে না।
      </p>
    </div>
  )
}
