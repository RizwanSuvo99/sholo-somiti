import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TransactionForms } from '@/app/admin/transactions/transaction-forms'
import { ToastProvider } from '@/components/ui/toast'

const CATEGORIES = [{ id: 'c1', name: 'ছাপার খরচ' }]
const MEMBERS = [{ id: 'm1', memberCode: 'NHSS-25001', name: 'আব্দুল ইসলাম', photoUrl: null }]

function renderForms() {
  return render(
    <ToastProvider>
      <TransactionForms categories={CATEGORIES} members={MEMBERS} />
    </ToastProvider>,
  )
}

describe('ledger entry forms', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('uses a calendar for the income date, defaulted to today', async () => {
    const user = userEvent.setup()
    renderForms()

    await user.click(screen.getByRole('button', { name: 'আয় যোগ করুন' }))

    const date = screen.getByLabelText(/তারিখ/)
    expect(date).toHaveAttribute('readonly')
    expect(date.getAttribute('type')).not.toBe('date')
    // Prefilled, so the common case needs no interaction at all.
    expect((date as HTMLInputElement).value).not.toBe('')
    expect(document.querySelector('.react-datepicker__input-container')).not.toBeNull()
  })

  it('uses a calendar for the expense date too', async () => {
    const user = userEvent.setup()
    renderForms()

    await user.click(screen.getByRole('button', { name: 'ব্যয় যোগ করুন' }))

    expect(screen.getByLabelText(/তারিখ/)).toHaveAttribute('readonly')
    expect(document.querySelector('input[type="date"]')).toBeNull()
  })

  it('picks a member with the avatar list rather than a plain select', async () => {
    const user = userEvent.setup()
    renderForms()

    await user.click(screen.getByRole('button', { name: 'আয় যোগ করুন' }))
    expect(screen.getByRole('combobox', { name: /সদস্য/ })).toBeInTheDocument()
  })
})

describe('delay fee', () => {
  beforeEach(() => vi.restoreAllMocks())

  async function openDelayFee(user: ReturnType<typeof userEvent.setup>) {
    renderForms()
    await user.click(screen.getByRole('button', { name: 'বিলম্ব ফি যোগ করুন' }))
  }

  /** Scoped, because the panel's toggle sits on the same page as its fields. */
  const delayFeeForm = () => screen.getByLabelText(/বিলম্ব ফি \(টাকা\)/).closest('form')!

  it('is not an option on the generic income form', async () => {
    // One route only, so a delay fee always has a member attached.
    const user = userEvent.setup()
    renderForms()
    await user.click(screen.getByRole('button', { name: 'আয় যোগ করুন' }))

    const options = Array.from(screen.getByLabelText(/খাত/).querySelectorAll('option')).map(
      (option) => option.textContent,
    )
    expect(options).toEqual(['মাসিক চাঁদা', 'জরিমানা', 'অন্যান্য আয়'])
  })

  it('will not submit without a member', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    await openDelayFee(user)

    await user.type(screen.getByLabelText(/বিলম্ব ফি \(টাকা\)/), '500')
    await user.click(within(delayFeeForm()).getByRole('button', { name: 'সংরক্ষণ' }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText('সদস্য বেছে নিন')).toBeInTheDocument()
  })

  it('posts the member, the amount and the date to its own endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    await openDelayFee(user)

    await user.click(screen.getByRole('combobox', { name: /সদস্য/ }))
    await user.click(screen.getByRole('option', { name: /আব্দুল ইসলাম/ }))
    await user.type(screen.getByLabelText(/বিলম্ব ফি \(টাকা\)/), '500')
    await user.click(within(delayFeeForm()).getByRole('button', { name: 'সংরক্ষণ' }))

    expect(fetchMock).toHaveBeenCalled()
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/admin/transactions/delay-fee')
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body).toMatchObject({ memberCode: 'NHSS-25001', amount: '500' })
    expect(body.entryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('says plainly that it is not part of the member’s total', async () => {
    const user = userEvent.setup()
    await openDelayFee(user)
    expect(screen.getByText(/“মোট জমা”-তে যুক্ত\s*হবে না/)).toBeInTheDocument()
  })
})
