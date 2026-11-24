import { createContext, useContext } from 'react'
import type { Theme } from './theme'

export const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'dark',
  setTheme: () => {},
})

export const useTheme = () => useContext(ThemeContext)
