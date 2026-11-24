import { describe, expect, it } from 'vitest'
import { computeIndicators } from './rules'
import { syntheticCandles } from './sampleData'
import { resample, TIMEFRAMES } from './timeframe'
import type { Candle } from './types'

const DAY = 86_400
// 2024-01-01 was a Monday
const MONDAY = Date.UTC(2024, 0, 1) / 1000

function days(n: number, startDayOffset = 0): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const v = i + 1
    return { time: MONDAY + (i + startDayOffset) * DAY, open: v, high: v + 0.5, low: v - 0.5, close: v, volume: 1, takerBuyVolume: 0.5 }
  })
}

describe('resample to weekly', () => {
  it('builds Monday-to-Sunday candles from daily ones', () => {
    const { bars } = resample(days(14), TIMEFRAMES['1w'])
    expect(bars).toHaveLength(2)
    expect(bars[0]).toMatchObject({ time: MONDAY, open: 1, high: 7.5, low: 0.5, close: 7, volume: 7, takerBuyVolume: 3.5 })
    expect(bars[1]).toMatchObject({ open: 8, close: 14 })
  })

  it('shows a week only from its Sunday close on (no look-ahead)', () => {
    const { visible } = resample(days(14), TIMEFRAMES['1w'])
    expect(visible.slice(0, 6)).toEqual([-1, -1, -1, -1, -1, -1])
    expect(visible[6]).toBe(0) // Sunday: week 1 has just closed
    expect(visible.slice(7, 13)).toEqual([0, 0, 0, 0, 0, 0])
    expect(visible[13]).toBe(1)
  })

  it('drops a partial first week and an unfinished last week', () => {
    // Thursday Jan 4 .. Saturday Jan 20: only Jan 8-14 is a whole week
    const { bars, visible } = resample(days(17, 3), TIMEFRAMES['1w'])
    expect(bars).toHaveLength(1)
    expect(bars[0]).toMatchObject({ time: MONDAY + 7 * DAY, open: 5, close: 11 })
    expect(visible.slice(0, 10).every((v) => v === -1)).toBe(true)
    expect(visible[visible.length - 1]).toBe(0)
  })
})

describe('higher-timeframe indicators', () => {
  const candles = syntheticCandles(800, 11)

  it('a weekly SMA(1) equals the last closed weekly close', () => {
    const s = computeIndicators(candles, [{ id: 'w', defId: 'sma', params: { length: 1, source: 0 }, tf: '1w' }])
    const { bars, visible } = resample(candles, TIMEFRAMES['1w'])
    visible.forEach((idx, i) => {
      if (idx >= 0) expect(s.w.value[i]).toBeCloseTo(bars[idx].close, 6)
      else expect(Number.isNaN(s.w.value[i])).toBe(true)
    })
  })

  it('values for a prefix of the data match the full data (no look-ahead)', () => {
    const inst = [{ id: 'w', defId: 'ema', params: { length: 5, source: 0 }, tf: '1w' as const }]
    const full = computeIndicators(candles, inst).w.value
    const prefix = computeIndicators(candles.slice(0, 500), inst).w.value
    expect(prefix).toEqual(full.slice(0, 500))
  })

  it('a timeframe not above the chart timeframe computes on the chart', () => {
    const a = computeIndicators(candles, [{ id: 'x', defId: 'ema', params: { length: 5, source: 0 }, tf: '4h' }])
    const b = computeIndicators(candles, [{ id: 'x', defId: 'ema', params: { length: 5, source: 0 } }])
    expect(a.x.value).toEqual(b.x.value)
  })
})
