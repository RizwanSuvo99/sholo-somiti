'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  THEME_ATTRIBUTE,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  type Theme,
} from '@/lib/theme'

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>')
  return value
}

function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.getAttribute(THEME_ATTRIBUTE) === 'dark' ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Seeded from the attribute the inline script already wrote, not from storage,
  // so React agrees with what is on screen instead of deciding again. The lazy
  // initializer runs on the client during hydration, so this is already correct
  // by the time anything can be clicked.
  const [theme, setThemeState] = useState<Theme>(currentTheme)

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, next)
    storeTheme(next)
    setThemeState(next)
  }, [])

  // Follow the system only until a choice has been made. Someone who picked
  // light should stay in light when night falls.
  useEffect(() => {
    if (readStoredTheme() !== null) return

    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => {
      const next = resolveTheme(null, event.matches)
      document.documentElement.setAttribute(THEME_ATTRIBUTE, next)
      setThemeState(next)
    }

    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      // Reads the attribute rather than the state: the DOM is what the member
      // can see, so it is the thing to flip.
      toggleTheme: () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'),
    }),
    [theme, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
