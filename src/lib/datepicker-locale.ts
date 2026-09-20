import { registerLocale } from 'react-datepicker'
import { bn } from 'date-fns/locale'
import { BN_MONTHS } from '@/lib/bn'
import { toBnDigits } from '@/lib/money'

/**
 * The calendar locale, registered once for every picker in the app.
 *
 * Month names come from src/lib/bn.ts rather than date-fns. The two are
 * canonically equivalent but not byte-identical — date-fns writes য় as U+09DF
 * where the app uses U+09AF + U+09BC — so they render the same and compare
 * unequal, which surfaces later as a filter that silently matches nothing.
 *
 * Day numbers are also rendered in Bengali numerals, to match every other
 * number in the interface.
 */
const somitiLocale = {
  ...bn,
  localize: {
    ...bn.localize,
    month: (index: number) => BN_MONTHS[index + 1],
  },
} as typeof bn

export const CALENDAR_LOCALE = 'bn-somiti'

registerLocale(CALENDAR_LOCALE, somitiLocale)

/** Shared class names, so every picker input matches the app's other fields. */
export const CALENDAR_INPUT_CLASS =
  'w-full rounded-xl border border-line bg-panel px-3.5 py-2.5 text-ink shadow-sm transition ' +
  'focus:border-brand focus:ring-4 focus:ring-brand-ring/40 focus:outline-none'

export const bnDay = (day: number) => toBnDigits(day)
