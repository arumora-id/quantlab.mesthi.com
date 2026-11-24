export type Theme = 'light' | 'dark'
export const THEME_KEY = 'quantlab.theme'

/** Saved choice first, then the system preference; dark when neither says light. */
export function initialTheme(saved: string | null, prefersLight: boolean): Theme {
  if (saved === 'light' || saved === 'dark') return saved
  return prefersLight ? 'light' : 'dark'
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}
