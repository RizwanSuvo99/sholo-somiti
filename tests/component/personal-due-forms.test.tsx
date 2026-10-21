import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PersonalDueForms } from '@/app/admin/personal-dues/personal-due-forms'
import { ToastProvider } from '@/components/ui/toast'

const MEMBERS = [
  { memberCode: 'NHSS-25001', name: 'আব্দুল ইসলাম', photoUrl: null, isActive: true },
  { memberCode: 'NHSS-25002', name: 'করিম মিয়া', photoUrl: null, isActive: true },
]

const BALANCES = { 'NHSS-25001': 380_000 }

function renderForms(lockedMemberCode?: string) {
  return render(
    <ToastProvider>
      <PersonalDueForms
        members={MEMBERS}
        balances={BALANCES}
        lockedMemberCode={lockedMemberCode}
      />
    </ToastProvider>,
  )
}

function okFetch() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const form = (amountLabel: RegExp) => screen.getByLabelText(amountLabel).closest('form')!
const LOAN_AMOUNT = /ধারের পরিমাণ/
const REPAY_AMOUNT = /ফেরতের পরিমাণ/

async function openLoan(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'নতুন ধার যোগ করুন' }))
}

async function openRepayment(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'কিস্তি ফেরত নিন' }))
}

describe('the lending forms', () => {
  beforeEach(() => vi.restoreAllMocks())

  /**
   * The two forms differ by one field name. Posting a repayment with `lentOn`
   * would be accepted as a *loan*, doubling the balance instead of reducing it,
   * so the field name per direction is pinned here.
   */
  it('a loan is posted to the loans endpoint with lentOn', async () => {
    const fetchMock = okFetch()
    const user = userEvent.setup()
    renderForms()
    await openLoan(user)

    await user.click(screen.getByRole('combobox', { name: /সদস্য/ }))
    await user.click(screen.getByRole('option', { name: /আব্দুল ইসলাম/ }))
    await user.type(screen.getByLabelText(LOAN_AMOUNT), '5000')
    await user.click(within(form(LOAN_AMOUNT)).getByRole('button', { name: 'সংরক্ষণ' }))

    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/admin/personal-dues/loans')
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body).toMatchObject({ memberCode: 'NHSS-25001', amount: '5000' })
    expect(body.lentOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.paidOn).toBeUndefined()
  })

  it('a repayment is posted to the repayments endpoint with paidOn', async () => {
    const fetchMock = okFetch()
    const user = userEvent.setup()
    renderForms()
    await openRepayment(user)

    await user.click(screen.getByRole('combobox', { name: /সদস্য/ }))
    await user.click(screen.getByRole('option', { name: /আব্দুল ইসলাম/ }))
    await user.type(screen.getByLabelText(REPAY_AMOUNT), '1200')
    await user.click(within(form(REPAY_AMOUNT)).getByRole('button', { name: 'সংরক্ষণ' }))

    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/admin/personal-dues/repayments')
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body).toMatchObject({ memberCode: 'NHSS-25001', amount: '1200' })
    expect(body.paidOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.lentOn).toBeUndefined()
  })

  it('will not submit without a member', async () => {
    const fetchMock = okFetch()
    const user = userEvent.setup()
    renderForms()
    await openLoan(user)

    await user.type(screen.getByLabelText(LOAN_AMOUNT), '5000')
    await user.click(within(form(LOAN_AMOUNT)).getByRole('button', { name: 'সংরক্ষণ' }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText('সদস্য বেছে নিন')).toBeInTheDocument()
  })

  it('shows what the chosen person still owes, so a typo is obvious', async () => {
    const user = userEvent.setup()
    renderForms()
    await openRepayment(user)

    await user.click(screen.getByRole('combobox', { name: /সদস্য/ }))
    await user.click(screen.getByRole('option', { name: /আব্দুল ইসলাম/ }))

    expect(screen.getByText(/এখন বাকি/)).toHaveTextContent('৩,৮০০')
  })

  it('shows the server’s Bengali refusal instead of a generic failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { messageBn: 'ফেরতের পরিমাণ বাকির চেয়ে বেশি' } }),
      } as Response),
    )
    const user = userEvent.setup()
    renderForms()
    await openRepayment(user)

    await user.click(screen.getByRole('combobox', { name: /সদস্য/ }))
    await user.click(screen.getByRole('option', { name: /আব্দুল ইসলাম/ }))
    await user.type(screen.getByLabelText(REPAY_AMOUNT), '99999')
    await user.click(within(form(REPAY_AMOUNT)).getByRole('button', { name: 'সংরক্ষণ' }))

    expect(await screen.findByText('ফেরতের পরিমাণ বাকির চেয়ে বেশি')).toBeInTheDocument()
  })

  describe('opened from one person’s page', () => {
    it('fixes the member and posts that member', async () => {
      const fetchMock = okFetch()
      const user = userEvent.setup()
      renderForms('NHSS-25002')
      await openLoan(user)

      // Locked, so an entry started on Karim's page cannot land on Rahim.
      expect(screen.getByRole('combobox', { name: /সদস্য/ })).toBeDisabled()

      await user.type(screen.getByLabelText(LOAN_AMOUNT), '700')
      await user.click(within(form(LOAN_AMOUNT)).getByRole('button', { name: 'সংরক্ষণ' }))

      const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
      expect(body.memberCode).toBe('NHSS-25002')
    })
  })

  it('uses the calendar widget for the date, prefilled with today', async () => {
    const user = userEvent.setup()
    renderForms()
    await openLoan(user)

    const date = screen.getByLabelText(/যেদিন টাকা দিয়েছেন/)
    expect(date).toHaveAttribute('readonly')
    expect((date as HTMLInputElement).value).not.toBe('')
    expect(document.querySelector('input[type="date"]')).toBeNull()
  })
})
