import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemberCard } from '@/components/public/member-card'

const MEMBER = {
  memberCode: 'NHSS-25001',
  name: 'Md Saifur Rahman',
  photoUrl: 'https://img.invalid/a.jpg',
  joinedOn: { y: 2025, m: 10, d: 1 },
  totalContributedPaisa: 3_400_000,
  currentMonthStatus: 'PAID_ON_TIME',
}

describe('MemberCard', () => {
  it('backs the status badge with an opaque layer in both themes', () => {
    // The badge sits on top of a photograph, and its own dark-mode fill is a
    // 12% tint — fine over a panel, invisible over an image. Without a backdrop
    // the label floats on the photo with nothing behind it.
    render(<MemberCard member={MEMBER} />)

    const badge = screen.getByText('সময়মতো পরিশোধিত').closest('span')!
    const backdrop = badge.parentElement!.closest('span[class*="absolute"]')!

    expect(backdrop.className).toMatch(/\bbg-\S+/)
    expect(backdrop.className).toMatch(/\bdark:bg-\S+/)
  })

  it('keeps the contribution total out of the badge', () => {
    render(<MemberCard member={MEMBER} />)
    expect(screen.getByText(/৩৪,০০০/)).toBeInTheDocument()
    expect(screen.getByText('NHSS-25001')).toBeInTheDocument()
  })
})
