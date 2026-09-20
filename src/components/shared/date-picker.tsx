'use client'

import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { CALENDAR_INPUT_CLASS, CALENDAR_LOCALE } from '@/lib/datepicker-locale'
import { civilDateLabel, BN_MONTHS } from '@/lib/bn'
import { toBnDigits } from '@/lib/money'
import type { CivilDate } from '@/lib/due-cycle'

/**
 * A day calendar.
 *
 * Days are carried in and out as `CivilDate` — a calendar day with no time and
 * no zone, which is what every date field in this app actually means. `Date` is
 * used only inside this component and always built at local noon, because
 * midnight can land on the previous day once an offset is applied and silently
 * shift the selection by one.
 */
export function DateField({
  value,
  onChange,
  label,
  hint,
  error,
  required,
  min,
  max,
  placeholder = 'তারিখ বেছে নিন',
}: {
  value: CivilDate | null
  onChange: (date: CivilDate | null) => void
  label: string
  hint?: string
  error?: string
  required?: boolean
  min?: CivilDate
  max?: CivilDate
  placeholder?: string
}) {
  const id = useId()
  const describedById = `${id}-hint`

  const toDate = (d: CivilDate) => new Date(d.y, d.m - 1, d.d, 12)

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>

      <DatePicker
        id={id}
        selected={value ? toDate(value) : null}
        onChange={(date: Date | null) =>
          onChange(
            date ? { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() } : null,
          )
        }
        locale={CALENDAR_LOCALE}
        placeholderText={placeholder}
        customInput={<CalendarInput display={value ? civilDateLabel(value) : ''} />}
        minDate={min ? toDate(min) : undefined}
        maxDate={max ? toDate(max) : undefined}
        showPopperArrow={false}
        autoComplete="off"
        aria-describedby={hint || error ? describedById : undefined}
        wrapperClassName="w-full"
        popperClassName="somiti-datepicker"
        renderDayContents={(day) => toBnDigits(day)}
        renderCustomHeader={({
          date,
          decreaseMonth,
          increaseMonth,
          prevMonthButtonDisabled,
          nextMonthButtonDisabled,
        }) => (
          <div className="flex items-center justify-between px-3 py-2">
            <NavButton
              onClick={decreaseMonth}
              disabled={prevMonthButtonDisabled}
              label="আগের মাস"
            >
              ‹
            </NavButton>
            <span className="text-sm font-semibold text-ink">
              {BN_MONTHS[date.getMonth() + 1]} {toBnDigits(date.getFullYear())}
            </span>
            <NavButton onClick={increaseMonth} disabled={nextMonthButtonDisabled} label="পরের মাস">
              ›
            </NavButton>
          </div>
        )}
      />

      {(hint || error) && (
        <p id={describedById} className={error ? 'text-xs text-danger' : 'text-xs text-muted'}>
          {error ?? hint}
        </p>
      )}

      {value && (
        <p className="sr-only" aria-live="polite">
          নির্বাচিত তারিখ {civilDateLabel(value)}
        </p>
      )}
    </div>
  )
}

/**
 * The text shown in the field.
 *
 * date-fns formats the day and year with Latin digits whatever the locale, so
 * the default input would read "10 এপ্রিল 2026" — half localised. This renders
 * the app's own label instead and ignores the value the library passes in.
 *
 * Read-only by design: the value is a calendar day picked from the calendar,
 * and free text in Bengali numerals would only invite parsing ambiguity.
 */
const CalendarInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { display?: string }
>(function CalendarInput({ display, value: _libraryValue, ...props }, ref) {
  return (
    <input
      {...props}
      ref={ref}
      readOnly
      value={display ?? ''}
      className={CALENDAR_INPUT_CLASS + ' cursor-pointer'}
    />
  )
})

function NavButton({
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
