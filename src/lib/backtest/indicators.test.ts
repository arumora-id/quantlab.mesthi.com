import { describe, expect, it } from 'vitest'
import { bollinger, ema, rsi } from './indicators'

describe('ema', () => {
  it('seeds with the SMA, then smooths with alpha 2/(n+1)', () => {
    const out = ema([1, 2, 3, 4, 5], 3)
    expect(out.slice(0, 2).every(Number.isNaN)).toBe(true)
    expect(out.slice(2)).toEqual([2, 3, 4])
  })
})

describe('rsi', () => {
  it("uses Wilder's smoothing", () => {
    const out = rsi([1, 2, 3, 2, 3], 2)
    expect(out.slice(0, 2).every(Number.isNaN)).toBe(true)
    expect(out[2]).toBe(100)
    expect(out[3]).toBeCloseTo(50)
    expect(out[4]).toBeCloseTo(75)
  })
})

describe('bollinger', () => {
  it('returns middle SMA and bands at k population std devs', () => {
    const { middle, upper, lower } = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2)
    // population std dev of this classic sample is exactly 2, mean is 5
    expect(middle[7]).toBe(5)
    expect(upper[7]).toBe(9)
    expect(lower[7]).toBe(1)
  })
})
