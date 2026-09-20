/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_THEME,
  THEME_ATTRIBUTE,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  readStoredTheme,
  resolveTheme,
  storeTheme,
} from '@/lib/theme'

function runInitScript() {
  new Function(THEME_INIT_SCRIPT)()
}

function mockPrefersDark(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  )
}

describe('resolveTheme', () => {
  it.each(['dark', 'light'] as const)('honours a stored choice of %s', (stored) => {
    expect(resolveTheme(stored)).toBe(stored)
  })

  it('opens dark for a first-time visitor', () => {
    expect(resolveTheme(null)).toBe(DEFAULT_THEME)
    expect(DEFAULT_THEME).toBe('dark')
  })

  it('ignores a stored value that is not a theme', () => {
    expect(resolveTheme('purple')).toBe(DEFAULT_THEME)
    expect(resolveTheme('')).toBe(DEFAULT_THEME)
  })
})

describe('the inline script that runs before first paint', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute(THEME_ATTRIBUTE)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('applies a stored choice of light over the dark default', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')

    runInitScript()

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light')
  })

  it('opens dark when nothing has been chosen', () => {
    runInitScript()

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark')
  })

  it('does not consult the system preference', () => {
    // The site opens dark by decision, so a light OS must not override it.
    mockPrefersDark(false)

    runInitScript()

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark')
  })

  it('still sets the attribute when storage throws', () => {
    // Private windows and blocked site data both do this; the page must not
    // render unthemed.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    runInitScript()

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark')
    vi.restoreAllMocks()
  })
})

describe('storage helpers', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a choice', () => {
    storeTheme('dark')
    expect(readStoredTheme()).toBe('dark')
  })

  it('reports nothing when unset or junk', () => {
    expect(readStoredTheme()).toBeNull()
    localStorage.setItem(THEME_STORAGE_KEY, 'chartreuse')
    expect(readStoredTheme()).toBeNull()
  })

  it('does not throw when storage refuses a write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(() => storeTheme('dark')).not.toThrow()
    vi.restoreAllMocks()
  })
})
