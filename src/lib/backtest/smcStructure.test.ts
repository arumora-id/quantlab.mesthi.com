import { describe, expect, it } from 'vitest'
import { syntheticCandles } from './sampleData'
import { smcStructure } from './smcStructure'
import type { Candle } from './types'

const fromCloses = (cs: number[]): Candle[] =>
  cs.map((x, i) => ({ time: i * 86_400, open: x, high: x, low: x, close: x, volume: 1 }))

describe('smcStructure', () => {
  // length 1: a swing high at index 2 (value 5) is confirmed at index 3
  const c = fromCloses([3, 4, 5, 4, 3, 2, 3, 6, 7, 6, 8, 5, 4, 1])

  it('marks a CHoCH on the first break and BOS on the next break the same way', () => {
    const s = smcStructure(c, 1)
    expect(s.choch[7]).toBe(1) // 6 closes above the swing high 5
    expect(s.trend[7]).toBe(1)
    expect(s.bos[10]).toBe(1) // 8 breaks the newer swing high 7
  })

  it('marks a bearish CHoCH when a swing low breaks in an uptrend', () => {
    const s = smcStructure(c, 1)
    const i = s.choch.indexOf(-1)
    expect(i).toBeGreaterThan(10)
    expect(s.trend[i]).toBe(-1)
  })

  it('uses swings only after they are confirmed (no look-ahead)', () => {
    const candles = syntheticCandles(600, 2)
    const full = smcStructure(candles, 5)
    const prefix = smcStructure(candles.slice(0, 350), 5)
    expect(prefix.trend).toEqual(full.trend.slice(0, 350))
  })
})
