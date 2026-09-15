import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MembersTable, type MemberRow } from '@/app/admin/members/members-table'
import { ToastProvider } from '@/components/ui/toast'

const ROWS: MemberRow[] = [
  {
    id: 'a',
    memberCode: 'NHSS-25001',
    name: 'আব্দুল ইসলাম',
    fatherName: 'নাজমুল আহমেদ',
    mobile: '01700000137',
    email: '',
    joinedOn: '2025-01-01',
    photoUrl: null,
    photoPublicId: null,
    isActive: true,
  },
  {
    id: 'b',
    memberCode: 'NHSS-25002',
    name: 'মোহাম্মদ হোসেন',
    fatherName: '',
    mobile: '',
    email: '',
    joinedOn: '2025-01-01',
    photoUrl: null,
    photoPublicId: null,
    isActive: false,
  },
]

const okResponse = () =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'a' }) } as Response)

function renderTable() {
  return render(
    <ToastProvider>
      <MembersTable members={ROWS} />
    </ToastProvider>,
  )
}

const openEditor = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(screen.getByRole('button', { name: `${name} সম্পাদনা করুন` }))

describe('admin members table', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('shows no dialog until an action is taken', () => {
    renderTable()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens an edit dialog prefilled with the member', async () => {
    const user = userEvent.setup()
    renderTable()

    await openEditor(user, 'আব্দুল ইসলাম')

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText(/^নাম/)).toHaveValue('আব্দুল ইসলাম')
    expect(within(dialog).getByLabelText(/পিতার নাম/)).toHaveValue('নাজমুল আহমেদ')
    expect(within(dialog).getByLabelText(/মোবাইল/)).toHaveValue('01700000137')
  })

  it('states that the member code cannot change', async () => {
    // Codes are referenced by historical dues; changing one would orphan them.
    const user = userEvent.setup()
    renderTable()

    await openEditor(user, 'আব্দুল ইসলাম')

    expect(screen.getByRole('dialog').textContent).toContain('আইডি নম্বর পরিবর্তন করা যায় না')
    expect(within(screen.getByRole('dialog')).queryByDisplayValue('NHSS-25001')).toBeNull()
  })

  it('saves the edited fields and confirms with a toast', async () => {
    const fetchMock = okResponse()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderTable()

    await openEditor(user, 'আব্দুল ইসলাম')

    const name = within(screen.getByRole('dialog')).getByLabelText(/^নাম/)
    await user.clear(name)
    await user.type(name, 'আব্দুল করিম')
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/members/a')
    expect((init as RequestInit).method).toBe('PATCH')
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ name: 'আব্দুল করিম' })

    await waitFor(() =>
      expect(screen.getByText('সদস্যের তথ্য হালনাগাদ হয়েছে')).toBeInTheDocument(),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('discards changes on cancel without calling the API', async () => {
    const fetchMock = okResponse()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderTable()

    await openEditor(user, 'আব্দুল ইসলাম')
    await user.clear(within(screen.getByRole('dialog')).getByLabelText(/^নাম/))
    await user.click(screen.getByRole('button', { name: 'বাতিল' }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the dialog on Escape', async () => {
    const user = userEvent.setup()
    renderTable()

    await openEditor(user, 'আব্দুল ইসলাম')
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('refuses an empty name and keeps the dialog open', async () => {
    const fetchMock = okResponse()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderTable()

    await openEditor(user, 'আব্দুল ইসলাম')
    await user.clear(within(screen.getByRole('dialog')).getByLabelText(/^নাম/))
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText('নাম খালি রাখা যাবে না')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('reports a server failure as an error toast', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { messageBn: 'সংরক্ষণ করা যায়নি' } }),
      } as Response),
    )
    const user = userEvent.setup()
    renderTable()

    await openEditor(user, 'আব্দুল ইসলাম')
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }))

    await waitFor(() => expect(screen.getByText('সংরক্ষণ করা যায়নি')).toBeInTheDocument())
    // The dialog stays open so the edit is not lost.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('confirms in a dialog before deactivating, and says what will happen', async () => {
    const fetchMock = okResponse()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderTable()

    await user.click(screen.getByRole('button', { name: 'আব্দুল ইসলাম নিষ্ক্রিয় করুন' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('পুরোনো সব হিসাব অক্ষত থাকবে')
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'নিষ্ক্রিয় করুন' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      isActive: false,
    })
    await waitFor(() =>
      expect(screen.getByText('সদস্য নিষ্ক্রিয় করা হয়েছে')).toBeInTheDocument(),
    )
  })

  it('does nothing when the confirmation is dismissed', async () => {
    const fetchMock = okResponse()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderTable()

    await user.click(screen.getByRole('button', { name: 'আব্দুল ইসলাম নিষ্ক্রিয় করুন' }))
    await user.click(screen.getByRole('button', { name: 'বাতিল' }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lets the admin change the member photo from the dialog', async () => {
    const fetchMock = okResponse()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderTable()

    await openEditor(user, 'আব্দুল ইসলাম')

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('সদস্যের ছবি')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'ছবি বেছে নিন' })).toBeInTheDocument()

    // Saving carries the photo fields, so clearing a photo actually clears it.
    await user.click(screen.getByRole('button', { name: 'সংরক্ষণ করুন' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body).toHaveProperty('photoUrl', null)
    expect(body).toHaveProperty('photoPublicId', null)
  })

  it('shows the existing photo when the member has one', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <MembersTable
          members={[{ ...ROWS[0], photoUrl: 'https://img.invalid/a.jpg', photoPublicId: 'p1' }]}
        />
      </ToastProvider>,
    )

    await openEditor(user, 'আব্দুল ইসলাম')

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'সরান' })).toBeInTheDocument()
  })

  it('offers reactivation for an inactive member', async () => {
    const fetchMock = okResponse()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderTable()

    await user.click(screen.getByRole('button', { name: 'মোহাম্মদ হোসেন সক্রিয় করুন' }))
    await user.click(screen.getByRole('button', { name: 'সক্রিয় করুন' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      isActive: true,
    })
  })
})
