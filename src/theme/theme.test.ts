import { describe, expect, it } from 'vitest'
import { initialTheme } from './theme'

describe('initialTheme', () => {
  it('keeps a saved choice', () => {
    expect(initialTheme('light', false)).toBe('light')
    expect(initialTheme('dark', true)).toBe('dark')
  })
  it('follows the system otherwise, dark by default', () => {
    expect(initialTheme(null, true)).toBe('light')
    expect(initialTheme(null, false)).toBe('dark')
    expect(initialTheme('purple', false)).toBe('dark')
  })
})
