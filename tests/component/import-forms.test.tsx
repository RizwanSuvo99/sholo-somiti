import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportForms } from '@/app/admin/import/import-forms'
import { ToastProvider } from '@/components/ui/toast'
import type { DueMonth } from '@/lib/due-cycle'
import { BN_MONTHS } from '@/lib/bn'

const MEMBERS = [
  { memberCode: 'NHSS-25001', name: 'আব্দুল ইসলাম', isActive: true, photoUrl: null },
  { memberCode: 'NHSS-25002', name: 'মোহাম্মদ হোসেন', isActive: true, photoUrl: null },
  { memberCode: 'NHSS-25003', name: 'সাবেক সদস্য', isActive: false, photoUrl: null },
]

const CURRENT: DueMonth = { dueYear: 2026, dueMonth: 3 }
const IMPORTED: DueMonth[] = [{ dueYear: 2025, dueMonth: 11 }]

function mockPost() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ batchId: 'b1', affected: 4 }),
  } as Response)
}

function renderForms(importedMonths: DueMonth[] = []) {
  return render(
    <ToastProvider>
      <ImportForms members={MEMBERS} currentDue={CURRENT} importedMonths={importedMonths} />
    </ToastProvider>,
  )
}

/**
 * The page now carries two member pickers — the fine form's and the backfill
 * form's — so every lookup here is scoped to the form under test rather than
 * to the whole page.
 */
const fineForm = () => screen.getByRole('button', { name: /জরিমানা যোগ করুন/ }).closest('form')!

const fineMemberBox = () =>
  within(fineForm()).getByRole('combobox', { name: /সদস্যের আইডি/ })

const openMemberList = (user: ReturnType<typeof userEvent.setup>) => user.click(fineMemberBox())

/** Opens the month calendar for a field and picks a month by its Bengali name. */
async function pickMonth(
  user: ReturnType<typeof userEvent.setup>,
  fieldLabel: RegExp,
  monthName: string,
) {
  await user.click(screen.getByLabelText(fieldLabel))
  const option = await screen.findByText(monthName)
  await user.click(option)
}

describe('historical import forms', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('lists every member, including deactivated ones', async () => {
    // A fine being backfilled may belong to someone who has since left.
    const user = userEvent.setup()
    renderForms()

    await openMemberList(user)
    const list = screen.getByRole('listbox')
    expect(within(list).getAllByRole('option')).toHaveLength(3)
    expect(screen.getByRole('option', { name: /সাবেক সদস্য/ }).textContent).toContain('নিষ্ক্রিয়')
  })

  it('uses a calendar rather than month and year dropdowns', () => {
    renderForms()

    expect(screen.getByLabelText(/কোন মাসের জরিমানা/)).toBeInTheDocument()
    expect(screen.getByLabelText(/কোন মাসের চাঁদা/)).toBeInTheDocument()
    // The old pair of selects is gone.
    expect(screen.queryByLabelText(/^মাস/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^বছর/)).not.toBeInTheDocument()
  })

  it('says when the society started collecting', () => {
    renderForms()
    expect(screen.getAllByText(/নভেম্বর ২০২৫ থেকে হিসাব শুরু/).length).toBeGreaterThan(0)
  })

  it('will not submit a fine without a member', async () => {
    const fetchMock = mockPost()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderForms()

    await user.click(screen.getByRole('button', { name: /জরিমানা যোগ করুন/ }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText('সদস্য বেছে নিন')).toBeInTheDocument()
  })

  it('will not submit a fine without a month', async () => {
    const fetchMock = mockPost()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderForms()

    await openMemberList(user)
    await user.click(screen.getByRole('option', { name: /মোহাম্মদ হোসেন/ }))
    await user.click(screen.getByRole('button', { name: /জরিমানা যোগ করুন/ }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText('মাস বেছে নিন')).toBeInTheDocument()
  })

  it('submits the chosen member and month, then clears the form', async () => {
    const fetchMock = mockPost()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderForms()

    await openMemberList(user)
    await user.click(screen.getByRole('option', { name: /মোহাম্মদ হোসেন/ }))
    await pickMonth(user, /কোন মাসের জরিমানা/, BN_MONTHS[2])

    await user.click(screen.getByRole('button', { name: /জরিমানা যোগ করুন/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toMatchObject({
      memberCode: 'NHSS-25002',
      month: 2,
      year: 2026,
      amount: '200',
    })

    // Leaving the form filled invites submitting the same month twice.
    await waitFor(() => expect(screen.getByLabelText(/কোন মাসের জরিমানা/)).toHaveValue(''))
    expect(fineMemberBox().textContent).toContain('সদস্য বাছুন')
  })

  it('confirms before applying a due to everyone, then clears', async () => {
    const fetchMock = mockPost()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderForms()

    await pickMonth(user, /কোন মাসের চাঁদা/, BN_MONTHS[2])
    await user.type(screen.getByLabelText(/চাঁদার পরিমাণ/), '500')

    await user.click(screen.getByRole('button', { name: /সবার জন্য যোগ করুন/ }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText(/নিশ্চিত হলে আবার চাপুন/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /নিশ্চিত করুন/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/import/uniform-due')

    await waitFor(() => expect(screen.getByLabelText(/চাঁদার পরিমাণ/)).toHaveValue(''))
    expect(screen.getByLabelText(/কোন মাসের চাঁদা/)).toHaveValue('')
  })

  it('reports a server refusal as an error toast and keeps the form filled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { messageBn: 'এই মাস ইতিমধ্যে যোগ করা হয়েছে' } }),
      } as Response),
    )
    const user = userEvent.setup()
    renderForms()

    await pickMonth(user, /কোন মাসের চাঁদা/, BN_MONTHS[2])
    await user.type(screen.getByLabelText(/চাঁদার পরিমাণ/), '500')
    await user.click(screen.getByRole('button', { name: /সবার জন্য যোগ করুন/ }))
    await user.click(screen.getByRole('button', { name: /নিশ্চিত করুন/ }))

    await waitFor(() =>
      expect(screen.getByText('এই মাস ইতিমধ্যে যোগ করা হয়েছে')).toBeInTheDocument(),
    )
    // Nothing is cleared, so the entry can be corrected rather than retyped.
    expect(screen.getByLabelText(/চাঁদার পরিমাণ/)).toHaveValue('500')
  })

  it('warns that already-imported months cannot be chosen', () => {
    renderForms(IMPORTED)
    expect(screen.getByText(/১টি মাস বাছা যাবে না/)).toBeInTheDocument()
  })

  it('disables months outside the collection period and ones already imported', async () => {
    const user = userEvent.setup()
    renderForms([{ dueYear: 2025, dueMonth: 12 }])

    await user.click(screen.getByLabelText(/কোন মাসের চাঁদা/))
    await user.click(screen.getByLabelText('আগের বছর'))

    const cell = (name: string) =>
      document.querySelector(`.react-datepicker__month-${name}`)!.className

    // Before the society started collecting.
    expect(cell('9')).toContain('--disabled') // October 2025
    // The first month it did.
    expect(cell('10')).not.toContain('--disabled') // November 2025
    // Already imported.
    expect(cell('11')).toContain('--disabled') // December 2025
  })

  it('shows the year in Bengali numerals', async () => {
    const user = userEvent.setup()
    renderForms()

    await user.click(screen.getByLabelText(/কোন মাসের চাঁদা/))
    expect(document.querySelector('.react-datepicker__header')?.textContent).toContain('২০২৬')
  })
})

const PLAN = {
  member: {
    memberCode: 'NHSS-25002',
    name: 'মোহাম্মদ হোসেন',
    photoUrl: null,
    joinedOn: { y: 2026, m: 3, d: 1 },
  },
  months: [
    {
      dueYear: 2025,
      dueMonth: 11,
      label: 'নভেম্বর ২০২৫',
      amountPaisa: 200_000,
      outcome: 'WILL_ADD',
    },
    {
      dueYear: 2025,
      dueMonth: 12,
      label: 'ডিসেম্বর ২০২৫',
      amountPaisa: 200_000,
      outcome: 'ALREADY_PAID',
    },
  ],
  totalPaisa: 200_000,
  addCount: 1,
  alreadyPaidCount: 1,
  unpricedCount: 0,
  joinedOnWouldBecome: { y: 2025, m: 10, d: 21 },
}

/** Answers the preview GET and the import POST from the same stub. */
function mockBackfill(plan: unknown = PLAN) {
  return vi.fn(async (...args: [url: string, init?: RequestInit]) =>
    String(args[0]).includes('/preview')
      ? ({ ok: true, json: async () => plan } as Response)
      : ({ ok: true, json: async () => ({ batchId: 'b1', affected: 1 }) } as Response),
  )
}

const backfillForm = () =>
  screen.getByRole('button', { name: /পুরোনো চাঁদা যোগ করুন/ }).closest('form')!

async function pickBackfillMember(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(backfillForm()).getByRole('combobox', { name: /সদস্যের আইডি/ }))
  await user.click(screen.getByRole('option', { name: /মোহাম্মদ হোসেন/ }))
}

describe('backfilling one member’s past months', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('shows every month and the total before anything is written', async () => {
    vi.stubGlobal('fetch', mockBackfill())
    const user = userEvent.setup()
    renderForms()

    await pickBackfillMember(user)

    const preview = await screen.findByText('নভেম্বর ২০২৫')
    expect(preview).toBeInTheDocument()
    // A month already settled is listed but struck through, not silently dropped.
    expect(screen.getByText('আগেই পরিশোধিত')).toBeInTheDocument()
    // The total, read from the summary line rather than the month rows, which
    // carry the same figure. 200,000 paisa is ৳2,000.
    const summary = screen.getByText(/১ মাস যোগ হবে/).closest('div')!
    expect(within(summary).getByText(/২,০০০/)).toBeInTheDocument()
  })

  it('warns that the joining date will move', async () => {
    vi.stubGlobal('fetch', mockBackfill())
    const user = userEvent.setup()
    renderForms()

    await pickBackfillMember(user)
    expect(await screen.findByText(/২১ অক্টোবর ২০২৫ করা হবে/)).toBeInTheDocument()
  })

  it('posts the range and the joining-date choice', async () => {
    const fetchMock = mockBackfill()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderForms()

    await pickBackfillMember(user)
    await screen.findByText('নভেম্বর ২০২৫')
    await user.click(screen.getByRole('button', { name: /পুরোনো চাঁদা যোগ করুন/ }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((call) => !String(call[0]).includes('/preview'))
      expect(post).toBeTruthy()
      expect(JSON.parse(String((post![1] as RequestInit).body))).toMatchObject({
        memberCode: 'NHSS-25002',
        fromMonth: 11,
        fromYear: 2025,
        toMonth: CURRENT.dueMonth,
        toYear: CURRENT.dueYear,
        alignJoinedOn: true,
      })
    })
  })

  it('refuses to submit when there is nothing to add', async () => {
    vi.stubGlobal(
      'fetch',
      mockBackfill({ ...PLAN, months: [PLAN.months[1]], addCount: 0, totalPaisa: 0 }),
    )
    const user = userEvent.setup()
    renderForms()

    await pickBackfillMember(user)
    await screen.findByText(/এই মাসগুলোর হিসাব আগেই যোগ করা আছে/)
    expect(screen.getByRole('button', { name: /পুরোনো চাঁদা যোগ করুন/ })).toBeDisabled()
  })

  it('blocks the import when a month has no amount set', async () => {
    vi.stubGlobal(
      'fetch',
      mockBackfill({
        ...PLAN,
        months: [{ ...PLAN.months[0], amountPaisa: 0, outcome: 'UNPRICED' }],
        addCount: 0,
        unpricedCount: 1,
        totalPaisa: 0,
      }),
    )
    const user = userEvent.setup()
    renderForms()

    await pickBackfillMember(user)
    expect(await screen.findByText(/পরিমাণ নির্ধারণ করা হয়নি/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /পুরোনো চাঁদা যোগ করুন/ })).toBeDisabled()
  })
})
