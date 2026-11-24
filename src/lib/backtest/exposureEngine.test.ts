import { describe, expect, it } from 'vitest'
import { runExposureBacktest } from './exposureEngine'
import type { Candle } from './types'

const bars = (rows: [number, number][]): Candle[] =>
  rows.map(([open, close], i) => ({
    time: i * 86_400,
    open,
    close,
    high: Math.max(open, close),
    low: Math.min(open, close),
    volume: 1,
  }))

const cfg = { initialCapital: 10_000, feeBps: 0, slippageBps: 0, rebalanceBand: 0 }

describe('runExposureBacktest', () => {
  const c = bars([
    [100, 100],
    [100, 110],
    [110, 110],
  ])

  it('trades the weight decided at a close on the next open', () => {
    const r = runExposureBacktest(c, [1, 1, 1], cfg)
    expect(r.trades[0]).toMatchObject({ entryTime: c[1].time, entryPrice: 100, exitReason: 'end' })
    expect(r.metrics.finalEquity).toBeCloseTo(11_000)
  })

  it('half a weight earns half the move', () => {
    const r = runExposureBacktest(c, [0.5, 0.5, 0.5], cfg)
    expect(r.metrics.finalEquity).toBeCloseTo(10_500)
  })

  it('charges fees on the traded amount only', () => {
    // buy 50 units at 100 (fee 0.1% of 5,000 = 5), hold to the end without selling
    const r = runExposureBacktest(c, [0.5, 0.5, 0.5], { ...cfg, feeBps: 10 })
    expect(r.metrics.finalEquity).toBeCloseTo(10_495)
  })

  it('skips small rebalances inside the band but always exits to cash', () => {
    const c4 = bars([[100, 100], [100, 110], [110, 110], [110, 110]])
    const r = runExposureBacktest(c4, [0.5, 0.55, 0, 0], { ...cfg, feeBps: 10, rebalanceBand: 0.1 })
    expect(r.trades).toHaveLength(1)
    // entry 5,000 notional (fee 5), exit at open 110: 50 units * 110 = 5,500 (fee 5.5)
    expect(r.trades[0]).toMatchObject({ exitPrice: 110, exitReason: 'signal' })
    expect(r.metrics.finalEquity).toBeCloseTo(10_000 - 5 + 500 - 5.5)
  })

  it('starts flat at startIndex', () => {
    const r = runExposureBacktest(c, [1, 1, 1], cfg, 1)
    expect(r.equity).toHaveLength(2)
    expect(r.trades[0].entryTime).toBe(c[2].time)
  })
})
