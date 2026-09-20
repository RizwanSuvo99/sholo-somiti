/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
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
  it.each([
    ['dark', false, 'dark'],
    ['light', true, 'light'],
  ])('honours a stored choice of %s over the system', (stored, prefersDark, expected) => {
    expect(resolveTheme(stored, prefersDark)).toBe(expected)
  })

  it('follows the system when nothing has been chosen', () => {
    expect(resolveTheme(null, true)).toBe('dark')
    expect(resolveTheme(null, false)).toBe('light')
  })

  it('ignores a stored value that is not a theme', () => {
    expect(resolveTheme('purple', true)).toBe('dark')
    expect(resolveTheme('', false)).toBe('light')
  })
})

describe('the inline script that runs before first paint', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute(THEME_ATTRIBUTE)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('applies a stored choice', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    mockPrefersDark(false)

    runInitScript()

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark')
  })

  it('falls back to the system preference', () => {
    mockPrefersDark(true)

    runInitScript()

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark')
  })

  it('always sets the attribute, so nothing renders unthemed', () => {
    mockPrefersDark(false)

    runInitScript()

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light')
  })

  it('settles on light when storage throws', () => {
    // Private windows and blocked site data both do this.
    const boom = () => {
      throw new Error('blocked')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
    mockPrefersDark(true)

    runInitScript()

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light')
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
