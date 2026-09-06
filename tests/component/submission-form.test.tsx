import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SubmissionForm } from '@/app/(site)/pay/submit/submission-form'

const MEMBERS = [
  { memberCode: 'NHSS-25001', name: 'আব্দুল ইসলাম', photoUrl: null },
  { memberCode: 'NHSS-25002', name: 'মোহাম্মদ হোসেন', photoUrl: null },
]

/** The ID picker is a listbox, not a native select, so it can show avatars. */
async function pickMember(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole('combobox', { name: /আইডি নম্বর/ }))
  await user.click(screen.getByRole('option', { name }))
}

function lookupResponse(memberCode: string, overrides: Record<string, unknown> = {}) {
  const member = MEMBERS.find((m) => m.memberCode === memberCode)
  return {
    found: true,
    member: { id: memberCode, memberCode, name: member?.name ?? '' },
    currentDue: { dueMonth: 10, dueYear: 2026, label: 'অক্টোবর ২০২৬', amountPaisa: 50_000 },
    eligibleDueMonths: [
      {
        dueMonth: 10,
        dueYear: 2026,
        label: 'অক্টোবর ২০২৬',
        amountPaisa: 50_000,
        blocked: false,
        blockedReason: null,
        isCurrent: true,
      },
    ],
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
