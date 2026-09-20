export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'somiti-theme'
export const THEME_ATTRIBUTE = 'data-theme'

/**
 * Applies the theme before the first paint.
 *
 * This runs as a blocking inline script in <head>, which is the only way to get
 * it right: the choice lives in localStorage, the server cannot read it, and
 * doing this in an effect would show every returning member a flash of the
 * wrong theme on every page load.
 *
 * It is written as a string because it must not wait for the JavaScript bundle.
 * Storage can throw — private windows, blocked site data — so a failure quietly
 * falls back to the system preference rather than leaving the page unstyled.
 *
 * `tests/unit/theme.test.ts` executes this exact string, so it cannot drift
 * away from the behaviour it is supposed to have.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('${THEME_ATTRIBUTE}', theme);
  } catch (e) {
    document.documentElement.setAttribute('${THEME_ATTRIBUTE}', 'light');
  }
})();
`.trim()

/** The theme to start with, given what was stored and what the system prefers. */
export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored
  return prefersDark ? 'dark' : 'light'
}

export function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // A refused write only costs the preference on the next visit.
  }
}
