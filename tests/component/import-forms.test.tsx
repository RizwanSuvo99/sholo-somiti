import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportForms } from '@/app/admin/import/import-forms'

const MEMBERS = [
  { memberCode: 'NHSS-25001', name: 'আব্দুল ইসলাম', isActive: true, photoUrl: null },
  { memberCode: 'NHSS-25002', name: 'মোহাম্মদ হোসেন', isActive: true, photoUrl: null },
  { memberCode: 'NHSS-25003', name: 'সাবেক সদস্য', isActive: false, photoUrl: null },
]

async function openMemberList(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('combobox', { name: /সদস্যের আইডি/ }))
}

function mockPost() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ batchId: 'b1', affected: 1 }),
  } as Response)
}

describe('historical fine import — member selector', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('lists every member as an option', async () => {
    const user = userEvent.setup()
    render(<ImportForms members={MEMBERS} />)

    await openMemberList(user)
    const list = screen.getByRole('listbox')
    expect(within(list).getAllByRole('option')).toHaveLength(3)
  })

  it('includes deactivated members, marked as such', async () => {
    // A fine being backfilled may belong to someone who has since left.
    const user = userEvent.setup()
    render(<ImportForms members={MEMBERS} />)

    await openMemberList(user)
    expect(screen.getByRole('option', { name: /সাবেক সদস্য/ }).textContent).toContain('নিষ্ক্রিয়')
  })

  it('submits the selected member code', async () => {
    const fetchMock = mockPost()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<ImportForms members={MEMBERS} />)

    await openMemberList(user)
    await user.click(screen.getByRole('option', { name: /মোহাম্মদ হোসেন/ }))
    await user.click(screen.getByRole('button', { name: /জরিমানা যোগ করুন/ }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/import/fines')
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      memberCode: 'NHSS-25002',
      amount: '200',
    })
  })

  it('will not submit without a member chosen', async () => {
    // The value rides in a hidden input, which HTML `required` does not cover,
    // so the form checks it itself.
    const fetchMock = mockPost()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<ImportForms members={MEMBERS} />)
    await user.click(screen.getByRole('button', { name: /জরিমানা যোগ করুন/ }))

    expect(fetchMock).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('সদস্য বেছে নিন')).toBeInTheDocument())
  })

  it('asks for confirmation before applying a due to every member', async () => {
    const fetchMock = mockPost()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<ImportForms members={MEMBERS} />)

    const amount = screen.getByLabelText(/চাঁদার পরিমাণ/)
    await user.type(amount, '500')

    const apply = screen.getByRole('button', { name: /সবার জন্য যোগ করুন/ })
    await user.click(apply)

    // First click only arms the confirmation — nothing is sent yet.
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText(/নিশ্চিত হলে আবার চাপুন/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /নিশ্চিত করুন/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/import/uniform-due')
  })
})
