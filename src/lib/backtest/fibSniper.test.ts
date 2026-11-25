import { describe, expect, it } from 'vitest'
import { fibSniperPlans, runFibSniperBacktest, type FibSniperParams } from './fibSniper'
import { runPlannedTrades } from './plannedTrades'
import { syntheticCandles } from './sampleData'
import type { Candle } from './types'

const base: FibSniperParams = {
  swing: 2,
  fibLow: 0.5,
  fibHigh: 0.618,
  targetExt: 0.272,
  wait: 50,
  requireFvg: 0,
  htfEma: 0,
  riskPct: 1,
  maxWeight: 1,
  tickBps: 1,
}

const bar = (i: number, open: number, high: number, low: number, close: number): Candle => ({
  time: i * 900,
  open,
  high,
  low,
  close,
  volume: 1,
})

describe('fibSniperPlans', () => {
  // swing high 105 (i=2), swing low 90 (i=6), close 107 breaks 105 (CHoCH up),
  // extreme becomes 110, then a bullish candle dips to 99.5 (0.5-0.618 zone) and closes at 102
  const c = [
    bar(0, 100, 101, 99, 100),
    bar(1, 100, 103, 99, 102),
    bar(2, 102, 105, 101, 103),
    bar(3, 103, 104, 98, 99),
    bar(4, 99, 100, 94, 95),
    bar(5, 95, 96, 92, 93),
    bar(6, 93, 94, 90, 92),
    bar(7, 92, 97, 91, 96),
    bar(8, 96, 100, 95, 99),
    bar(9, 99, 107, 98, 107), // CHoCH up: close above the swing high 105
    bar(10, 107, 110, 106, 108),
    bar(11, 108, 109, 103, 104),
    bar(12, 100.5, 103, 99.5, 102), // into the zone [99.82, 100], bullish close above 0.618
    bar(13, 102, 103, 101, 102.5),
  ]

  it('enters after a CHoCH on a bullish rejection of the 0.5-0.618 zone', () => {
    const plans = fibSniperPlans(c, base)
    expect(plans).toHaveLength(1)
    const p = plans[0]
    expect(p.side).toBe(1)
    expect(p.entryIndex).toBe(13)
    expect(p.stop).toBeLessThan(90) // just below the origin
    expect(p.target).toBeCloseTo(110 + 0.272 * 20) // extension of the 90 -> 110 leg
  })

  it('needs a fair value gap in the leg when required', () => {
    expect(fibSniperPlans(c, { ...base, requireFvg: 1 })).toHaveLength(1) // bar 9 low 98 > bar 7 high 97
    // remove every gap in the leg: each low dips below the high two bars earlier
    const lows: Record<number, number> = { 8: 93, 9: 96, 10: 99 }
    const noGap = c.map((x, i) => (i in lows ? { ...x, low: lows[i] } : x))
    expect(fibSniperPlans(noGap, { ...base, requireFvg: 1 })).toHaveLength(0)
  })

  it('does not look ahead and keeps stops and targets on the right side', () => {
    // hour-aligned start, like Binance candles, so 1h candles are complete
    const candles = syntheticCandles(3000, 17).map((x, i) => ({ ...x, time: 1_699_999_200 + i * 900 }))
    const p = { ...base, swing: 3, htfEma: 50 }
    const full = fibSniperPlans(candles, p)
    expect(full.length).toBeGreaterThan(3)
    expect(fibSniperPlans(candles.slice(0, 2000), p)).toEqual(full.filter((x) => x.entryIndex < 2000))
    for (const x of full) expect(x.side === 1 ? x.stop < x.target : x.stop > x.target).toBe(true)
    const r = runFibSniperBacktest(candles, p, { initialCapital: 10_000, feeBps: 5, slippageBps: 2 })
    expect(r.trades.every((t) => ['stop', 'target', 'end'].includes(t.exitReason))).toBe(true)
  })
})

describe('runPlannedTrades', () => {
  it('sizes by risk and exits at the target', () => {
    const c = [bar(0, 100, 100, 100, 100), bar(1, 100, 100, 100, 100), bar(2, 100, 106, 99, 105)]
    const r = runPlannedTrades(c, [{ side: 1, entryIndex: 1, stop: 98, target: 105 }], { riskPct: 1, maxWeight: 10 }, {
      initialCapital: 10_000,
      feeBps: 0,
      slippageBps: 0,
    })
    // risk 100 USDT over a 2-point stop = 50 units; +5 points = +250
    expect(r.trades[0]).toMatchObject({ exitReason: 'target', exitPrice: 105 })
    expect(r.metrics.finalEquity).toBeCloseTo(10_250)
  })
})
