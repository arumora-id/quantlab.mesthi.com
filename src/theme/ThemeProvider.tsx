import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ThemeContext } from './context'
import { applyTheme, initialTheme, THEME_KEY, type Theme } from './theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const t = initialTheme(localStorage.getItem(THEME_KEY), window.matchMedia('(prefers-color-scheme: light)').matches)
    applyTheme(t) // before the first render, so charts read the right colours
    return t
  })
  // apply immediately (not in an effect): child effects such as charts run before a parent's effects
  const setTheme = useCallback((t: Theme) => {
    applyTheme(t)
    setThemeState(t)
  }, [])
  useEffect(() => localStorage.setItem(THEME_KEY, theme), [theme])
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
