import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemberSelect, type MemberChoice } from '@/components/shared/member-select'

const MEMBERS: MemberChoice[] = [
  { memberCode: 'NHSS-25001', name: 'আব্দুল ইসলাম', photoUrl: 'https://img.invalid/a.jpg' },
  { memberCode: 'NHSS-25002', name: 'মোহাম্মদ হোসেন', photoUrl: null },
  { memberCode: 'NHSS-25003', name: 'সাবেক সদস্য', photoUrl: null, isActive: false },
]

function setup(value = '') {
  const onChange = vi.fn()
  const view = render(
    <MemberSelect label="আইডি নম্বর" members={MEMBERS} value={value} onChange={onChange} name="memberCode" />,
  )
  return { onChange, ...view }
}

describe('MemberSelect', () => {
  it('is a combobox that starts closed', () => {
    setup()
    const trigger = screen.getByRole('combobox', { name: /আইডি নম্বর/ })

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows every member with an avatar when opened', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('combobox', { name: /আইডি নম্বর/ }))

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)

    // The member with a photo renders an <img>; the others get a coloured initial.
    expect(within(options[0]).getByRole('presentation', { hidden: true })).toBeInTheDocument()
    expect(options[0].textContent).toContain('আব্দুল ইসলাম')
  })

  it('renders a photo for members that have one', async () => {
    const user = userEvent.setup()
    const { container } = setup()

    await user.click(screen.getByRole('combobox', { name: /আইডি নম্বর/ }))

    const images = container.querySelectorAll('img')
    expect(images.length).toBeGreaterThanOrEqual(1)
    // Decorative: the code and name are already in adjacent text.
    expect(images[0].getAttribute('alt')).toBe('')
    expect(images[0].className).toContain('rounded-full')
  })

  it('reports the chosen member', async () => {
    const user = userEvent.setup()
    const { onChange } = setup()

    await user.click(screen.getByRole('combobox', { name: /আইডি নম্বর/ }))
    await user.click(screen.getByRole('option', { name: /মোহাম্মদ হোসেন/ }))

    expect(onChange).toHaveBeenCalledWith('NHSS-25002')
  })

  it('shows the selection on the trigger, with its avatar', () => {
    const { container } = setup('NHSS-25001')
    const trigger = screen.getByRole('combobox', { name: /আইডি নম্বর/ })

    expect(trigger.textContent).toContain('NHSS-25001')
    expect(trigger.textContent).toContain('আব্দুল ইসলাম')
    expect(container.querySelector('img')).toBeInTheDocument()
  })

  it('carries the value in a hidden input for FormData', () => {
    const { container } = setup('NHSS-25002')
    const hidden = container.querySelector('input[type="hidden"][name="memberCode"]')

    expect(hidden).toHaveValue('NHSS-25002')
  })

  it('filters by name or code', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('combobox', { name: /আইডি নম্বর/ }))
    await user.type(screen.getByLabelText('সদস্য খুঁজুন'), '25002')

    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option').textContent).toContain('মোহাম্মদ হোসেন')
  })

  it('says so when nothing matches', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('combobox', { name: /আইডি নম্বর/ }))
    await user.type(screen.getByLabelText('সদস্য খুঁজুন'), 'zzzz')

    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('কোনো সদস্য মেলেনি')).toBeInTheDocument()
  })

  it('marks an inactive member', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('combobox', { name: /আইডি নম্বর/ }))
    expect(screen.getByRole('option', { name: /সাবেক সদস্য/ }).textContent).toContain('নিষ্ক্রিয়')
  })

  it('opens and selects with the keyboard', async () => {
    const user = userEvent.setup()
    const { onChange } = setup()

    const trigger = screen.getByRole('combobox', { name: /আইডি নম্বর/ })
    trigger.focus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('NHSS-25002')
  })

  it('closes on Escape without choosing', async () => {
    const user = userEvent.setup()
    const { onChange } = setup()

    await user.click(screen.getByRole('combobox', { name: /আইডি নম্বর/ }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('marks the current selection for assistive technology', async () => {
    const user = userEvent.setup()
    setup('NHSS-25002')

    await user.click(screen.getByRole('combobox', { name: /আইডি নম্বর/ }))

    const chosen = screen.getByRole('option', { name: /মোহাম্মদ হোসেন/ })
    expect(chosen).toHaveAttribute('aria-selected', 'true')
  })
})
