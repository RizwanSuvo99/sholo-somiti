import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateField } from '@/components/shared/date-picker'
import { BN_MONTHS } from '@/lib/bn'
import type { CivilDate } from '@/lib/due-cycle'

const APRIL_10: CivilDate = { y: 2026, m: 4, d: 10 }

function setup(props: Partial<React.ComponentProps<typeof DateField>> = {}) {
  const onChange = vi.fn()
  render(
    <DateField label="তারিখ" value={props.value ?? null} onChange={onChange} {...props} />,
  )
  return { onChange }
}

const open = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByLabelText(/তারিখ/))

describe('DateField', () => {
  it('starts closed with an empty input', () => {
    setup()
    expect(screen.getByLabelText(/তারিখ/)).toHaveValue('')
    expect(document.querySelector('.react-datepicker')).toBeNull()
  })

  it('shows the selected day in Bengali', () => {
    setup({ value: APRIL_10 })
    expect(screen.getByLabelText(/তারিখ/)).toHaveValue(`১০ ${BN_MONTHS[4]} ২০২৬`)
  })

  it('opens a calendar headed with the Bengali month and year', async () => {
    const user = userEvent.setup()
    setup({ value: APRIL_10 })

    await open(user)
    const header = document.querySelector('.react-datepicker__header')?.textContent ?? ''
    expect(header).toContain(BN_MONTHS[4])
    expect(header).toContain('২০২৬')
  })

  it('renders day numbers in Bengali numerals', async () => {
    const user = userEvent.setup()
    setup({ value: APRIL_10 })

    await open(user)
    const days = [...document.querySelectorAll('.react-datepicker__day')].map((d) => d.textContent)
    expect(days).toContain('১')
    expect(days).toContain('১০')
    // No Latin digits anywhere in the grid.
    expect(days.join('')).not.toMatch(/[0-9]/)
  })

  it('reports the chosen day as a CivilDate', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ value: APRIL_10 })

    await open(user)
    const fifteenth = [...document.querySelectorAll('.react-datepicker__day')].find(
      (d) => d.textContent === '১৫' && !d.className.includes('outside-month'),
    )!
    await user.click(fifteenth)

    expect(onChange).toHaveBeenCalledWith({ y: 2026, m: 4, d: 15 })
  })

  it('disables days outside the allowed range', async () => {
    const user = userEvent.setup()
    setup({
      value: APRIL_10,
      min: { y: 2026, m: 4, d: 5 },
      max: { y: 2026, m: 4, d: 20 },
    })

    await open(user)
    const dayClass = (n: string) =>
      [...document.querySelectorAll('.react-datepicker__day')]
        .filter((d) => !d.className.includes('outside-month'))
        .find((d) => d.textContent === n)?.className ?? ''

    expect(dayClass('১')).toContain('--disabled')
    expect(dayClass('১০')).not.toContain('--disabled')
    expect(dayClass('২৫')).toContain('--disabled')
  })

  it('shows an error in place of the hint', () => {
    setup({ hint: 'সাহায্য', error: 'তারিখ সঠিক নয়' })

    expect(screen.getByText('তারিখ সঠিক নয়')).toBeInTheDocument()
    expect(screen.queryByText('সাহায্য')).not.toBeInTheDocument()
  })

  it('marks the field as required for assistive technology', () => {
    setup({ required: true })
    expect(screen.getByText('*')).toBeInTheDocument()
  })
})
