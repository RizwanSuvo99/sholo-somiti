'use client'

import { useId } from 'react'
import DatePicker, { registerLocale } from 'react-datepicker'
import { bn } from 'date-fns/locale'
import 'react-datepicker/dist/react-datepicker.css'
import type { DueMonth } from '@/lib/due-cycle'
import { BN_MONTHS, dueMonthLabel } from '@/lib/bn'
import { toBnDigits } from '@/lib/money'

/**
 * date-fns' own Bengali month names are canonically equivalent to the app's but
 * not byte-identical — it writes য় as U+09DF where src/lib/bn.ts uses U+09AF +
 * U+09BC. They look the same and compare unequal, which is the sort of thing
 * that surfaces much later as a filter that silently matches nothing. Taking
 * the month names from the app keeps one spelling everywhere.
 */
const somitiLocale = {
  ...bn,
  localize: {
    ...bn.localize,
    month: (index: number) => BN_MONTHS[index + 1],
  },
} as typeof bn

registerLocale('bn-somiti', somitiLocale)

/**
 * A month-and-year calendar.
 *
 * These fields always mean a whole month, never a day, so the picker runs in
 * month mode — offering a day would invite the question of which day matters.
 *
 * Months are carried in and out as `DueMonth`. `Date` is used only inside this
 * component, and always constructed at local noon on the 1st: midnight can land
 * on the previous day once a timezone offset is applied, which would shift the
 * selected month.
 */
export function MonthPicker({
  value,
  onChange,
  label,
  hint,
  required,
  min,
  max,
  disabledMonths = [],
  disabledHint,
}: {
  value: DueMonth | null
  onChange: (month: DueMonth) => void
  label: string
  hint?: string
  required?: boolean
  min?: DueMonth
  max?: DueMonth
  /** Months already accounted for, shown struck out and not selectable. */
  disabledMonths?: DueMonth[]
  /** Explains why a month is unavailable, shown under the field. */
  disabledHint?: string
}) {
  const id = useId()
  const hintId = `${id}-hint`

  const toDate = (month: DueMonth) => new Date(month.dueYear, month.dueMonth - 1, 1, 12)
  const excluded = disabledMonths.map(toDate)

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>

      <DatePicker
        id={id}
        selected={value ? toDate(value) : null}
        onChange={(date: Date | null) => {
          if (date) onChange({ dueYear: date.getFullYear(), dueMonth: date.getMonth() + 1 })
        }}
        showMonthYearPicker
        showFullMonthYearPicker
        dateFormat="MMMM yyyy"
        locale="bn-somiti"
        renderCustomHeader={({
          date,
          decreaseYear,
          increaseYear,
          prevYearButtonDisabled,
          nextYearButtonDisabled,
        }) => (
          <div className="flex items-center justify-between px-3 py-2">
            <HeaderButton onClick={decreaseYear} disabled={prevYearButtonDisabled} label="আগের বছর">
              ‹
            </HeaderButton>
            {/* The rest of the interface uses Bengali numerals; the library's
                own header would print the year in Latin digits. */}
            <span className="text-sm font-semibold text-ink">{toBnDigits(date.getFullYear())}</span>
            <HeaderButton onClick={increaseYear} disabled={nextYearButtonDisabled} label="পরের বছর">
              ›
            </HeaderButton>
          </div>
        )}
        placeholderText="মাস বেছে নিন"
        minDate={min ? toDate(min) : undefined}
        maxDate={max ? toDate(max) : undefined}
        excludeDates={excluded}
        aria-describedby={hint || disabledHint ? hintId : undefined}
        autoComplete="off"
        className="w-full rounded-xl border border-line bg-panel px-3.5 py-2.5 text-ink shadow-sm transition focus:border-brand focus:ring-4 focus:ring-brand-ring/40 focus:outline-none"
        wrapperClassName="w-full"
        popperClassName="somiti-datepicker"
      />

      {(hint || disabledHint) && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
          {hint && disabledHint ? ' · ' : ''}
          {disabledHint}
        </p>
      )}

      {value && (
        <p className="sr-only" aria-live="polite">
          নির্বাচিত মাস {dueMonthLabel(value)}
        </p>
      )}
    </div>
  )
}

function HeaderButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void
  disabled: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-7 place-items-center rounded-lg text-lg leading-none text-muted transition hover:bg-brand-soft hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
