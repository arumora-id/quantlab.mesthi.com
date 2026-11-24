import type { Candle } from './types'

/**
 * True when bar j is a swing low/high against `k` bars on each side. Only usable once bar j + k
 * has closed. Strict on the left, non-strict on the right: a flat extreme pivots on its first bar.
 */
export function pivotConfirmed(c: Candle[], j: number, k: number, dir: 'low' | 'high') {
  if (j - k < 0 || j + k >= c.length) return false
  const v = dir === 'low' ? c[j].low : c[j].high
  for (let m = j - k; m <= j + k; m++) {
    if (m === j) continue
    const o = dir === 'low' ? c[m].low : c[m].high
    const beats = dir === 'low' ? (m < j ? v < o : v <= o) : m < j ? v > o : v >= o
    if (!beats) return false
  }
  return true
}
