import { describe, expect, it } from 'vitest'
import { kalmanTrend } from './kalman'
import { syntheticCandles } from './sampleData'

describe('kalmanTrend', () => {
  it('learns the growth rate of a steady trend', () => {
    // +1% per bar with a little alternating noise
    const closes = Array.from({ length: 400 }, (_, i) => 100 * 1.01 ** i * (i % 2 ? 1.002 : 0.998))
    const { value, slope } = kalmanTrend(closes, 20, 0.01)
    expect(slope[399]).toBeGreaterThan(0.8)
    expect(slope[399]).toBeLessThan(1.2)
    expect(Math.abs(value[399] / (100 * 1.01 ** 399) - 1)).toBeLessThan(0.01)
  })

  it('turns the slope negative after the trend reverses', () => {
    const up = Array.from({ length: 200 }, (_, i) => 100 * 1.01 ** i)
    const down = Array.from({ length: 100 }, (_, i) => up[199] * 0.99 ** (i + 1))
    const { slope } = kalmanTrend([...up, ...down], 20, 0.01)
    expect(slope[199]).toBeGreaterThan(0)
    expect(slope[299]).toBeLessThan(0)
  })

  it('does not look ahead', () => {
    const closes = syntheticCandles(600, 4).map((c) => c.close)
    const full = kalmanTrend(closes, 20, 0.01)
    const prefix = kalmanTrend(closes.slice(0, 300), 20, 0.01)
    expect(prefix.value).toEqual(full.value.slice(0, 300))
  })
})
