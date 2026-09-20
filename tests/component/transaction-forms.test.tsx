import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
