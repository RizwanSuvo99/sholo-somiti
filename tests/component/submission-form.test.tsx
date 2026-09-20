import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SubmissionForm } from '@/app/(site)/pay/submit/submission-form'
import { addMonths, currentDueMonth } from '@/lib/due-cycle'
import { dueMonthLabel } from '@/lib/bn'

const MEMBERS = [
  { memberCode: 'NHSS-25001', name: 'আব্দুল ইসলাম', photoUrl: 'https://img.invalid/a.jpg' },
  { memberCode: 'NHSS-25002', name: 'মোহাম্মদ হোসেন', photoUrl: null },
]

/** The ID picker is a listbox, not a native select, so it can show avatars. */
async function pickMember(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole('combobox', { name: /আইডি নম্বর/ }))
  await user.click(screen.getByRole('option', { name }))
}

/**
 * Months relative to the cycle now open.
 *
 * Fixed dates would drift: a payment for a month whose deadline has passed is
 * genuinely late, so a hard-coded "current" month starts attracting a fine once
 * the calendar moves past it. The month now open never can — its deadline is
 * ahead by definition.
 */
const CURRENT = currentDueMonth()
const monthsAgo = (n: number) => addMonths(CURRENT, -n)

const month = (
  dueYear: number,
  dueMonth: number,
  label: string,
  outstandingDuePaisa: number,
  chargedFinePaisa = 0,
  extra: Record<string, unknown> = {},
) => ({
  dueMonth,
  dueYear,
  label,
  amountPaisa: outstandingDuePaisa,
  outstandingDuePaisa,
  chargedFinePaisa,
  amountSet: true,
  blocked: false,
  blockedReason: null,
  isCurrent: false,
  ...extra,
})

function lookupResponse(memberCode: string, overrides: Record<string, unknown> = {}) {
  const member = MEMBERS.find((m) => m.memberCode === memberCode)
  return {
    found: true,
    member: { id: memberCode, memberCode, name: member?.name ?? '' },
    currentDue: { dueMonth: 10, dueYear: 2026, label: 'অক্টোবর ২০২৬', amountPaisa: 50_000 },
    eligibleDueMonths: [month(2026, 10, 'অক্টোবর ২০২৬', 50_000, 0, { isCurrent: true })],
    ...overrides,
  }
}

/**
 * Answers with the member the request actually asked for, so a test cannot pass
 * by coincidence when the form sends the wrong code.
 */
function mockLookup(overrides: Record<string, unknown> = {}) {
  return vi.fn().mockImplementation((url: string) => {
    const code = new URL(url, 'http://test.local').searchParams.get('code') ?? ''
    return Promise.resolve({
      ok: true,
      json: async () => lookupResponse(code, overrides),
    } as Response)
  })
}

describe('public submission form — ID selector', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('offers every active member as an option', async () => {
    const user = userEvent.setup()
    render(<SubmissionForm members={MEMBERS} />)

    await user.click(screen.getByRole('combobox', { name: /আইডি নম্বর/ }))

    const options = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0].textContent).toContain('আব্দুল ইসলাম')
  })

  it('fills the name when an ID is selected', async () => {
    vi.stubGlobal('fetch', mockLookup())
    const user = userEvent.setup()

    render(<SubmissionForm members={MEMBERS} />)
    const name = screen.getByLabelText(/^নাম/) as HTMLInputElement
    expect(name.value).toBe('')

    await pickMember(user, /আব্দুল ইসলাম/)

    await waitFor(() => expect(name.value).toBe('আব্দুল ইসলাম'))
  })

  it('queries the lookup endpoint with the selected code', async () => {
    const fetchMock = mockLookup()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<SubmissionForm members={MEMBERS} />)
    await pickMember(user, /মোহাম্মদ হোসেন/)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(String(fetchMock.mock.calls[0][0])).toContain('code=NHSS-25002')
  })

  it('still fills the name from the dropdown when the lookup fails', async () => {
    // The name must not be left blank just because the network hiccupped.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const user = userEvent.setup()

    render(<SubmissionForm members={MEMBERS} />)
    await pickMember(user, /মোহাম্মদ হোসেন/)

    const name = screen.getByLabelText(/^নাম/) as HTMLInputElement
    await waitFor(() => expect(name.value).toBe('মোহাম্মদ হোসেন'))
  })

  it('shows nobody until an ID is picked', () => {
    render(<SubmissionForm members={MEMBERS} />)
    expect(screen.queryByText('আপনি বেছে নিয়েছেন')).not.toBeInTheDocument()
  })

  it('shows a large photo of whoever was picked', async () => {
    // The codes differ by one digit; picking the line above or below your own
    // would otherwise file a payment against someone else's name.
    vi.stubGlobal('fetch', mockLookup())
    const user = userEvent.setup()

    const { container } = render(<SubmissionForm members={MEMBERS} />)
    await pickMember(user, /আব্দুল ইসলাম/)

    const panel = screen.getByRole('region', { name: 'নির্বাচিত সদস্য' })
    expect(within(panel).getByText('NHSS-25001')).toBeInTheDocument()
    expect(within(panel).getByText('আব্দুল ইসলাম')).toBeInTheDocument()

    // Fills the panel rather than sitting beside the text, so it can be
    // checked without looking twice.
    const photo = panel.querySelector('img') as HTMLImageElement
    expect(photo.getAttribute('src')).toBe('https://img.invalid/a.jpg')
    expect(photo.getAttribute('data-nimg')).toBe('fill')
    expect(panel.querySelector('.aspect-3\\/2')).not.toBeNull()
    expect(container).toBeTruthy()
  })

  it('falls back to a coloured initial for a member with no photo', async () => {
    vi.stubGlobal('fetch', mockLookup())
    const user = userEvent.setup()

    render(<SubmissionForm members={MEMBERS} />)
    await pickMember(user, /মোহাম্মদ হোসেন/)

    const panel = screen.getByRole('region', { name: 'নির্বাচিত সদস্য' })
    expect(within(panel).getByText('NHSS-25002')).toBeInTheDocument()
    expect(panel.querySelector('img')).toBeNull()
  })

  it('swaps the photo when a different ID is picked', async () => {
    vi.stubGlobal('fetch', mockLookup())
    const user = userEvent.setup()

    render(<SubmissionForm members={MEMBERS} />)
    await pickMember(user, /আব্দুল ইসলাম/)

    const panelOf = () => screen.getByRole('region', { name: 'নির্বাচিত সদস্য' })
    await waitFor(() => expect(within(panelOf()).getByText('NHSS-25001')).toBeInTheDocument())

    await pickMember(user, /মোহাম্মদ হোসেন/)
    await waitFor(() => expect(within(panelOf()).getByText('NHSS-25002')).toBeInTheDocument())
    expect(within(panelOf()).queryByText('NHSS-25001')).not.toBeInTheDocument()
  })

  it('does not let the member type over the name', async () => {
    // The name must always match the registered member, so a payment proof
    // cannot be filed under someone else's name.
    vi.stubGlobal('fetch', mockLookup())
    const user = userEvent.setup()

    render(<SubmissionForm members={MEMBERS} />)
    await pickMember(user, /আব্দুল ইসলাম/)

    const name = screen.getByLabelText(/^নাম/) as HTMLInputElement
    await waitFor(() => expect(name.value).toBe('আব্দুল ইসলাম'))

    expect(name).toHaveAttribute('readonly')

    await user.type(name, 'অন্য নাম')
    expect(name.value).toBe('আব্দুল ইসলাম')
  })

  it('replaces the name when a different ID is chosen', async () => {
    vi.stubGlobal('fetch', mockLookup())
    const user = userEvent.setup()

    render(<SubmissionForm members={MEMBERS} />)
    const name = screen.getByLabelText(/^নাম/) as HTMLInputElement

    await pickMember(user, /মোহাম্মদ হোসেন/)
    await waitFor(() => expect(name.value).toBe('মোহাম্মদ হোসেন'))

    await pickMember(user, /আব্দুল ইসলাম/)
    await waitFor(() => expect(name.value).toBe('আব্দুল ইসলাম'))
  })

  it('shows the chosen member with an avatar on the trigger', async () => {
    vi.stubGlobal('fetch', mockLookup())
    const user = userEvent.setup()

    const { container } = render(<SubmissionForm members={MEMBERS} />)
    await pickMember(user, /আব্দুল ইসলাম/)

    const trigger = screen.getByRole('combobox', { name: /আইডি নম্বর/ })
    expect(trigger.textContent).toContain('NHSS-25001')
    // No photo on this member, so the avatar is the coloured initial.
    expect(container.querySelector('.rounded-full')).toBeInTheDocument()
  })

  it('warns and blocks submission when the month is already submitted', async () => {
    vi.stubGlobal(
      'fetch',
      mockLookup({
        eligibleDueMonths: [
          {
            dueMonth: 10,
            dueYear: 2026,
            label: 'অক্টোবর ২০২৬',
            amountPaisa: 50_000,
            blocked: true,
            blockedReason: 'এই মাসের আবেদন যাচাইয়ের অপেক্ষায় আছে',
            isCurrent: true,
          },
        ],
      }),
    )
    const user = userEvent.setup()

    render(<SubmissionForm members={MEMBERS} />)
    await pickMember(user, /আব্দুল ইসলাম/)

    await waitFor(() =>
      expect(screen.getByText(/যাচাইয়ের অপেক্ষায় আছে/)).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /জমা দিন/ })).toBeDisabled()
  })

  it('fills the amount from the subscription set for the month', async () => {
    vi.stubGlobal('fetch', mockLookup())
    const user = userEvent.setup()

    render(<SubmissionForm members={MEMBERS} />)
    await pickMember(user, /আব্দুল ইসলাম/)

    await waitFor(() => expect(screen.getByLabelText(/পরিমাণ/)).toHaveValue('500'))
  })

  it('adds up arrears, their fines and the current month', async () => {
    // November missed and fined, December missed and fined, January current:
    // ৫০০ + ২০০ + ৫০০ + ২০০ + ৫০০ = ১৯০০.
    vi.stubGlobal(
      'fetch',
      mockLookup({
        eligibleDueMonths: [
          month(monthsAgo(2).dueYear, monthsAgo(2).dueMonth, dueMonthLabel(monthsAgo(2)), 50_000, 20_000),
          month(monthsAgo(1).dueYear, monthsAgo(1).dueMonth, dueMonthLabel(monthsAgo(1)), 50_000, 20_000),
          month(CURRENT.dueYear, CURRENT.dueMonth, dueMonthLabel(CURRENT), 50_000, 0, {
            isCurrent: true,
          }),
        ],
      }),
    )
    const user = userEvent.setup()

    render(<SubmissionForm members={MEMBERS} />)
    await pickMember(user, /আব্দুল ইসলাম/)

    await waitFor(() => expect(screen.getByLabelText(/পরিমাণ/)).toHaveValue('1900'))

    // And the member can see what makes it up.
    expect(screen.getByText('যা পরিশোধ হবে')).toBeInTheDocument()
    expect(screen.getByText(dueMonthLabel(monthsAgo(2)))).toBeInTheDocument()
    expect(screen.getByText(/১,৯০০/)).toBeInTheDocument()
  })

  it('only covers months up to the one chosen', async () => {
    vi.stubGlobal(
      'fetch',
      mockLookup({
        eligibleDueMonths: [
          month(monthsAgo(1).dueYear, monthsAgo(1).dueMonth, dueMonthLabel(monthsAgo(1)), 50_000, 20_000),
          month(CURRENT.dueYear, CURRENT.dueMonth, dueMonthLabel(CURRENT), 50_000, 0, {
            isCurrent: true,
          }),
        ],
      }),
    )
    const user = userEvent.setup()

    render(<SubmissionForm members={MEMBERS} />)
    await pickMember(user, /আব্দুল ইসলাম/)
    await waitFor(() => expect(screen.getByLabelText(/পরিমাণ/)).toHaveValue('1200'))

    // Paying only up to the older month drops the current one from the total.
    const older = monthsAgo(1)
    await user.selectOptions(
      screen.getByLabelText(/কোন মাস পর্যন্ত/),
      `${older.dueYear}-${older.dueMonth}`,
    )
    await waitFor(() => expect(screen.getByLabelText(/পরিমাণ/)).toHaveValue('700'))
  })

  it('leaves out a month already awaiting review', async () => {
    // That money is already accounted for; charging for it again would take
    // payment twice.
    vi.stubGlobal(
      'fetch',
      mockLookup({
        eligibleDueMonths: [
          month(monthsAgo(1).dueYear, monthsAgo(1).dueMonth, dueMonthLabel(monthsAgo(1)), 50_000, 20_000, {
            blocked: true,
            blockedReason: 'এই মাসের আবেদন যাচাইয়ের অপেক্ষায় আছে',
          }),
          month(CURRENT.dueYear, CURRENT.dueMonth, dueMonthLabel(CURRENT), 50_000, 0, {
            isCurrent: true,
          }),
        ],
      }),
    )
    const user = userEvent.setup()

    render(<SubmissionForm members={MEMBERS} />)
    await pickMember(user, /আব্দুল ইসলাম/)

    await waitFor(() => expect(screen.getByLabelText(/পরিমাণ/)).toHaveValue('500'))
    expect(screen.queryByText(dueMonthLabel(monthsAgo(1)))).not.toBeInTheDocument()
  })

  it('does not let the member type over the quoted amount', async () => {
    // The figure is the society's own, worked out from what is owed. A typed
    // number would contradict the breakdown shown right above it.
    vi.stubGlobal('fetch', mockLookup())
    const user = userEvent.setup()

    render(<SubmissionForm members={MEMBERS} />)
    await pickMember(user, /আব্দুল ইসলাম/)

    const amount = screen.getByLabelText(/পরিমাণ/)
    await waitFor(() => expect(amount).toHaveValue('500'))
    expect(amount).toHaveAttribute('readonly')

    await user.type(amount, '999')
    expect(amount).toHaveValue('500')
  })

  it('re-quotes the amount when a different month is chosen', async () => {
    const older = monthsAgo(1)
    vi.stubGlobal(
      'fetch',
      mockLookup({
        eligibleDueMonths: [
          month(older.dueYear, older.dueMonth, dueMonthLabel(older), 50_000, 20_000),
          month(CURRENT.dueYear, CURRENT.dueMonth, dueMonthLabel(CURRENT), 50_000, 0, {
            isCurrent: true,
          }),
        ],
      }),
    )
    const user = userEvent.setup()

    render(<SubmissionForm members={MEMBERS} />)
    await pickMember(user, /আব্দুল ইসলাম/)
    await waitFor(() => expect(screen.getByLabelText(/পরিমাণ/)).toHaveValue('1200'))

    await user.selectOptions(
      screen.getByLabelText(/কোন মাস পর্যন্ত/),
      `${older.dueYear}-${older.dueMonth}`,
    )
    await waitFor(() => expect(screen.getByLabelText(/পরিমাণ/)).toHaveValue('700'))
  })

  it('will not let a month be chosen before the admin has priced it', async () => {
    // Quoting ৳ ০ would file the money as surplus instead of a subscription.
    vi.stubGlobal(
      'fetch',
      mockLookup({
        eligibleDueMonths: [
          month(CURRENT.dueYear, CURRENT.dueMonth, dueMonthLabel(CURRENT), 0, 0, {
            isCurrent: true,
            amountSet: false,
            blocked: true,
            blockedReason: 'এই মাসের চাঁদার পরিমাণ এখনো নির্ধারণ করা হয়নি',
          }),
        ],
      }),
    )
    const user = userEvent.setup()

    render(<SubmissionForm members={MEMBERS} />)
    await pickMember(user, /আব্দুল ইসলাম/)

    await waitFor(() =>
      expect(screen.getByText(/চাঁদার পরিমাণ এখনো নির্ধারণ করা হয়নি/)).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /জমা দিন/ })).toBeDisabled()
  })

  it('still accepts arrears when only the current month is unpriced', async () => {
    // The older month has a price and is genuinely owed, so it stays payable.
    const older = monthsAgo(1)
    vi.stubGlobal(
      'fetch',
      mockLookup({
        eligibleDueMonths: [
          month(older.dueYear, older.dueMonth, dueMonthLabel(older), 50_000, 20_000),
          month(CURRENT.dueYear, CURRENT.dueMonth, dueMonthLabel(CURRENT), 0, 0, {
            isCurrent: true,
            amountSet: false,
            blocked: true,
            blockedReason: 'এই মাসের চাঁদার পরিমাণ এখনো নির্ধারণ করা হয়নি',
          }),
        ],
      }),
    )
    const user = userEvent.setup()

    render(<SubmissionForm members={MEMBERS} />)
    await pickMember(user, /আব্দুল ইসলাম/)

    await waitFor(() => expect(screen.getByLabelText(/পরিমাণ/)).toHaveValue('700'))
    expect(screen.getByRole('button', { name: /জমা দিন/ })).not.toBeDisabled()
  })

  it('switches the conditional fields with the payment medium', async () => {
    vi.stubGlobal('fetch', mockLookup())
    const user = userEvent.setup()

    render(<SubmissionForm members={MEMBERS} />)

    // NPSB is the default, so a bank name is asked for.
    expect(screen.getByLabelText(/ব্যাংকের নাম/)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/পেমেন্ট মাধ্যম/), 'MOBILE_BANKING')

    expect(screen.queryByLabelText(/ব্যাংকের নাম/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/সেবা/)).toBeInTheDocument()
    expect(screen.getByLabelText(/যে নম্বর থেকে পাঠিয়েছেন/)).toBeInTheDocument()
  })
})
