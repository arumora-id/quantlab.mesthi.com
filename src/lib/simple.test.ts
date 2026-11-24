import { describe, expect, it } from 'vitest'
import { barsFor, isCapped, verdictOf } from './simple'

describe('barsFor', () => {
  it('converts a period into candles for the timeframe', () => {
    expect(barsFor('1d', 365)).toBe(365)
    expect(barsFor('4h', 182)).toBe(1092)
  })
  it('caps at 50,000 candles', () => {
    expect(barsFor('1h', 365)).toBe(8760)
    expect(barsFor('1m', 182)).toBe(50_000)
    expect(isCapped('1m', 182)).toBe(true)
    expect(isCapped('1d', 1460)).toBe(false)
  })
})

describe('verdictOf', () => {
  it('says when there were no trades', () => {
    expect(verdictOf({ trades: 0, totalReturn: 0, benchmarkReturn: 0.5 })).toBe('noTrades')
  })
  it('separates a loss, a profit behind buy & hold, and a win over it', () => {
    expect(verdictOf({ trades: 3, totalReturn: -0.1, benchmarkReturn: 2 })).toBe('loss')
    expect(verdictOf({ trades: 3, totalReturn: 0.2, benchmarkReturn: 2 })).toBe('profitBehind')
    expect(verdictOf({ trades: 3, totalReturn: 0.2, benchmarkReturn: -0.3 })).toBe('beat')
  })
})
