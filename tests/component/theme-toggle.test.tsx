import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme } from '@/components/ui/theme-provider'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { THEME_ATTRIBUTE, THEME_STORAGE_KEY } from '@/lib/theme'

function mockPrefersDark(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  )
}

function setup(initial: 'light' | 'dark' = 'light') {
  document.documentElement.setAttribute(THEME_ATTRIBUTE, initial)
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  )
}

const theme = () => document.documentElement.getAttribute(THEME_ATTRIBUTE)
const button = () => screen.getByRole('button', { name: 'আলো ও অন্ধকার থিম বদলান' })

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
    mockPrefersDark(false)
  })

  it('switches the document to dark', async () => {
    const user = userEvent.setup()
    setup('light')

    await user.click(button())

    expect(theme()).toBe('dark')
  })

  it('switches back to light', async () => {
    const user = userEvent.setup()
    setup('dark')

    await user.click(button())

    expect(theme()).toBe('light')
  })

  it('remembers the choice for the next visit', async () => {
    const user = userEvent.setup()
    setup('light')

    await user.click(button())

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('renders both icons so the server and browser agree', () => {
    // Choosing an icon in JavaScript would mismatch on hydration and show the
    // wrong one until React caught up.
    const { container } = setup('light')
    const svgs = container.querySelectorAll('svg')

    expect(svgs).toHaveLength(2)
    expect(svgs[0].getAttribute('class')).toContain('dark:hidden')
    expect(svgs[1].getAttribute('class')).toContain('hidden')
  })

  it('keeps one label whatever the theme', async () => {
    // The label cannot depend on state without mismatching on hydration; the
    // icon carries the state instead.
    const user = userEvent.setup()
    setup('light')

    const label = button().getAttribute('aria-label')
    await user.click(button())

    expect(button().getAttribute('aria-label')).toBe(label)
  })

  it('reads the current theme from the document, not stale state', async () => {
    // Something outside React may have changed it; the DOM is what the member
    // can actually see.
    const user = userEvent.setup()
    setup('light')

    document.documentElement.setAttribute(THEME_ATTRIBUTE, 'dark')
    await user.click(button())

    expect(theme()).toBe('light')
  })

  it('does not break when storage refuses the write', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const user = userEvent.setup()
    setup('light')

    await user.click(button())

    expect(theme()).toBe('dark')
    vi.restoreAllMocks()
  })
})

describe('useTheme', () => {
  it('refuses to work outside the provider', () => {
    function Orphan() {
      useTheme()
      return null
    }
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<Orphan />)).toThrow(/ThemeProvider/)
    quiet.mockRestore()
  })
})
