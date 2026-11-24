import { describe, expect, it } from 'vitest'
import { runBacktest } from './engine'
import type { BacktestConfig, Candle, Position, Strategy } from './types'

const DAY = 86_400

function bars(rows: [number, number, number, number][]): Candle[] {
  return rows.map(([open, high, low, close], i) => ({
    time: 1_700_000_000 + i * DAY,
    open,
    high,
    low,
    close,
    volume: 1,
  }))
}

function scripted(targets: Position[]): Strategy {
  return { id: 'test', name: 'test', description: '', params: [], targets: () => targets }
}

const base: BacktestConfig = {
  initialCapital: 10_000,
  feeBps: 0,
  slippageBps: 0,
  allowShort: false,
  leverage: 1,
  stopLossPct: 0,
  takeProfitPct: 0,
}

describe('runBacktest', () => {
  const candles = bars([
    [100, 100, 100, 100],
    [100, 110, 100, 110],
    [110, 121, 110, 121],
    [121, 121, 121, 121],
  ])

  it('fills a signal at the next bar open, never on the signal bar', () => {
    const r = runBacktest(candles, scripted([1, 1, 0, 0]), {}, base)
    expect(r.trades).toHaveLength(1)
    expect(r.trades[0]).toMatchObject({
      side: 1,
      entryPrice: 100,
      exitPrice: 121,
      entryTime: candles[1].time,
      exitTime: candles[3].time,
      exitReason: 'signal',
    })
    expect(r.metrics.finalEquity).toBeCloseTo(12_100)
    expect(r.metrics.totalReturn).toBeCloseTo(0.21)
  })

  it('charges the fee on both sides', () => {
    const r = runBacktest(candles, scripted([1, 1, 0, 0]), {}, { ...base, feeBps: 10 })
    expect(r.metrics.finalEquity).toBeCloseTo(12_075.8121, 3)
  })

  it('closes an open position at the last close with reason "end"', () => {
    const r = runBacktest(candles, scripted([1, 1, 1, 1]), {}, base)
    expect(r.trades[0]).toMatchObject({ exitPrice: 121, exitReason: 'end' })
  })

  it('ignores short signals unless shorting is allowed', () => {
    const down = bars([
      [100, 100, 100, 100],
      [100, 100, 90, 90],
      [90, 90, 81, 81],
      [81, 81, 81, 81],
    ])
    expect(runBacktest(down, scripted([-1, -1, 0, 0]), {}, base).trades).toHaveLength(0)
    const r = runBacktest(down, scripted([-1, -1, 0, 0]), {}, { ...base, allowShort: true })
    expect(r.trades[0]).toMatchObject({ side: -1, entryPrice: 100, exitPrice: 81 })
    expect(r.metrics.finalEquity).toBeCloseTo(11_900)
  })

  it('exits at the stop price intrabar and does not re-enter on the same signal', () => {
    const c = bars([
      [100, 100, 100, 100],
      [100, 101, 94, 96], // stop at 95 is hit
      [96, 99, 96, 99],
      [99, 99, 99, 99],
    ])
    const r = runBacktest(c, scripted([1, 1, 1, 1]), {}, { ...base, stopLossPct: 5 })
    expect(r.trades).toHaveLength(1)
    expect(r.trades[0]).toMatchObject({ exitPrice: 95, exitReason: 'stop' })
    expect(r.metrics.finalEquity).toBeCloseTo(9_500)
  })

  it('fills a gapped stop at the open, not at the stop level', () => {
    const c = bars([
      [100, 100, 100, 100],
      [100, 100, 100, 100],
      [90, 92, 88, 91],
    ])
    const r = runBacktest(c, scripted([1, 1, 1]), {}, { ...base, stopLossPct: 5 })
    expect(r.trades[0]).toMatchObject({ exitPrice: 90, exitReason: 'stop' })
  })

  it('scales profit and fees by leverage', () => {
    const r = runBacktest(candles, scripted([1, 1, 0, 0]), {}, { ...base, leverage: 2 })
    expect(r.metrics.finalEquity).toBeCloseTo(14_200)
  })

  it('liquidates when the adverse move wipes the margin, and stops trading', () => {
    const c = bars([
      [100, 100, 100, 100],
      [100, 100, 85, 95], // 5x long from 100 is wiped out at 80; low 85 survives
      [95, 96, 79, 90], // low 79 crosses 80
      [90, 90, 90, 90],
    ])
    const r = runBacktest(c, scripted([1, 1, 1, 1]), {}, { ...base, leverage: 5 })
    expect(r.trades).toHaveLength(1)
    expect(r.trades[0]).toMatchObject({ exitPrice: 80, exitReason: 'liquidation' })
    expect(r.metrics.finalEquity).toBe(0)
  })

  it('starts flat at startIndex for out-of-sample windows', () => {
    const r = runBacktest(candles, scripted([1, 1, 1, 0]), {}, base, 2)
    expect(r.equity.map((e) => e.time)).toEqual([candles[2].time, candles[3].time])
    expect(r.trades[0]).toMatchObject({ entryPrice: 121, exitPrice: 121 })
  })

  it('reports max drawdown from the equity peak', () => {
    const c = bars([
      [100, 100, 100, 100],
      [100, 120, 100, 120],
      [120, 120, 90, 90],
      [90, 90, 90, 90],
    ])
    const r = runBacktest(c, scripted([1, 1, 1, 1]), {}, base)
    expect(r.metrics.maxDrawdown).toBeCloseTo(0.25)
  })
})
