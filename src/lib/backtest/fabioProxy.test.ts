import { describe, expect, it } from 'vitest'
import { fabioPlans, runFabioBacktest, type FabioParams } from './fabioProxy'
import { syntheticCandles } from './sampleData'
import { localClock, LONDON_OPEN, NEW_YORK_OPEN, sessionMask } from './sessions'
import { volumeProfile } from './volumeProfile'
import type { Candle } from './types'

const bar = (low: number, high: number, volume: number, i = 0): Candle => ({
  time: i * 60,
  open: low,
  high,
  low,
  close: high,
  volume,
})

describe('volumeProfile', () => {
  // 4 bins of width 1 between 0 and 4
  const c = [bar(0, 1, 10), bar(1, 2, 2), bar(2, 3, 30), bar(3, 4, 8)]
  const p = volumeProfile(c, 4)!

  it('spreads volume by range overlap and finds the POC', () => {
    expect(p.volumes).toEqual([10, 2, 30, 8])
    expect(p.poc).toBe(2.5)
  })

  it('grows the 70% value area towards the busier neighbour', () => {
    // 30 (bin 2) -> neighbours 2 and 8 -> takes 8 (bin 3): 38 of 50 = 76%
    expect([p.val, p.vah]).toEqual([2, 4])
  })

  it('marks interior low-volume nodes', () => {
    expect(p.lvnBins).toEqual([1])
  })

  it('puts a flat candle in one bin', () => {
    const q = volumeProfile([bar(0, 4, 4), { ...bar(1.5, 1.5, 10), open: 1.5, close: 1.5 }], 4)!
    expect(q.volumes).toEqual([1, 11, 1, 1])
  })
})

describe('sessions', () => {
  it('follows daylight saving time in New York and London', () => {
    const ny = localClock(NEW_YORK_OPEN.timeZone)
    expect(ny(Date.UTC(2026, 6, 1, 13, 30) / 1000)).toEqual({ weekday: 3, minute: 9 * 60 + 30 }) // EDT
    expect(ny(Date.UTC(2026, 0, 15, 14, 30) / 1000)).toEqual({ weekday: 4, minute: 9 * 60 + 30 }) // EST
    const ldn = localClock(LONDON_OPEN.timeZone)
    expect(ldn(Date.UTC(2026, 6, 1, 7, 0) / 1000).minute).toBe(8 * 60) // BST
  })

  it('marks Mon-Fri window candles and the last one', () => {
    const start = Date.UTC(2026, 0, 16, 14, 28) / 1000 // Friday 09:28 EST
    const times = Array.from({ length: 125 }, (_, i) => start + i * 60)
    const { inside, last } = sessionMask(times, 60, NEW_YORK_OPEN)
    expect(inside.slice(0, 3)).toEqual([false, false, true])
    expect(last.indexOf(true)).toBe(2 + 119) // 09:30 .. 11:29
  })
})

describe('Fabio proxy', () => {
  const start = Date.UTC(2026, 0, 5) / 1000 // Monday 00:00 UTC
  const candles = syntheticCandles(20 * 1440, 9).map((c, i) => ({
    ...c,
    time: start + i * 60,
    takerBuyVolume: c.volume * (c.close > c.open ? 0.7 : 0.3),
  }))
  const base: FabioParams = { mode: 'trend', bins: 32, watch: 15, deltaMin: 0.2, riskPct: 0.25, maxWeight: 1, tickBps: 1 }

  for (const mode of ['trend', 'reversion'] as const) {
    it(`${mode}: plans do not depend on later candles`, () => {
      const full = fabioPlans(candles, { ...base, mode })
      const cut = 14 * 1440
      const prefix = fabioPlans(candles.slice(0, cut), { ...base, mode })
      expect(prefix).toEqual(full.filter((x) => x.entryIndex < cut))
    })
  }

  it('closes every trade by stop, target or the end of the window, risking at most the budget', () => {
    const r = runFabioBacktest(candles, { ...base, mode: 'reversion' }, { initialCapital: 10_000, feeBps: 5, slippageBps: 2 })
    expect(r.trades.every((t) => ['stop', 'target', 'session', 'end'].includes(t.exitReason))).toBe(true)
    // a stop can gap past its level, so allow a little more than 0.25%
    expect(r.trades.filter((t) => t.exitReason === 'stop').every((t) => t.returnPct > -0.005)).toBe(true)
  })
})
