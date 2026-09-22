import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { StatusBadge } from '@/components/shared/status-badge'

describe('StatusBadge', () => {
  it('reads PENDING as still owed on a due payment', () => {
    const { container } = render(<StatusBadge status="PENDING" />)
    expect(container.textContent).toContain('বাকি')
  })

  it('reads PENDING as awaiting review on a submission', () => {
    // The shared label map lists the due-payment wording first, so a submission
    // used to be badged "বাকি" — telling a member who had just paid that their
    // payment was outstanding.
    const { container } = render(<StatusBadge status="PENDING" kind="submission" />)
    expect(container.textContent).toContain('অপেক্ষমাণ')
    expect(container.textContent).not.toContain('বাকি')
  })

  it.each([
    ['APPROVED', 'অনুমোদিত'],
    ['REJECTED', 'প্রত্যাখ্যাত'],
  ])('labels %s the same either way', (status, label) => {
    expect(render(<StatusBadge status={status} />).container.textContent).toContain(label)
    expect(
      render(<StatusBadge status={status} kind="submission" />).container.textContent,
    ).toContain(label)
  })
})
