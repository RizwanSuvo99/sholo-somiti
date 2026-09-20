import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { StatTile, type Tone } from '@/components/public/stat-tile'

/** Every tone that paints its own colours rather than using theme tokens. */
const ACCENT_TONES: Tone[] = ['emerald', 'sky', 'amber', 'violet', 'rose', 'indigo']

function shellOf(tone: Tone) {
  const { container } = render(<StatTile tone={tone} label="পরীক্ষা" value="৳১০০" />)
  return (container.firstElementChild as HTMLElement).className
}

describe('StatTile tones', () => {
  // One tone was shipped without a dark shell because a find-and-replace missed
  // it — the panel stayed white in dark mode with dark text on it. Checking
  // every tone here rather than trusting the edit.
  it.each(ACCENT_TONES)('%s restates its background for dark', (tone) => {
    const className = shellOf(tone)

    expect(className).toMatch(/dark:from-/)
    expect(className).toMatch(/dark:border-/)
  })

  it.each(ACCENT_TONES)('%s restates its text colour for dark', (tone) => {
    const { container } = render(<StatTile tone={tone} label="পরীক্ষা" value="৳১০০" />)
    const html = container.innerHTML

    expect(html).toMatch(/dark:text-/)
  })

  it('leaves the neutral tone to the theme tokens', () => {
    // `slate` is built from bg-panel and border-line, which already follow the
    // theme, so it needs no dark variant of its own.
    expect(shellOf('slate')).toContain('bg-panel')
  })

  it('still renders the label and value', () => {
    const { getByText } = render(<StatTile tone="violet" label="অন্যান্য আয়" value="৳১,০০০" />)

    expect(getByText('অন্যান্য আয়')).toBeInTheDocument()
    expect(getByText('৳১,০০০')).toBeInTheDocument()
  })
})
