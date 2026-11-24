import { describe, expect, it } from 'vitest'
import { INDICATORS } from './catalog'
import { PRESETS } from './presets'
import { evaluateGroup, setupToStrategy, type Setup } from './rules'
import { syntheticCandles } from './sampleData'
import type { Candle } from './types'

function fromCloses(cs: number[]): Candle[] {
  return cs.map((c, i) => ({ time: i * 86_400, open: c, high: c, low: c, close: c, volume: 1 }))
}

const close = { kind: 'price', field: 'close' } as const
const num = (value: number) => ({ kind: 'number', value }) as const

describe('evaluateGroup', () => {
  const c = fromCloses([1, 3, 2, 4])

  it('detects a cross above only on the bar it happens', () => {
    const g = evaluateGroup({ mode: 'all', conditions: [{ left: close, op: 'crossesAbove', right: num(2.5) }] }, c, {})
    expect(g).toEqual([false, true, false, true])
  })

  it('combines conditions with AND / OR', () => {
    const conds = [
      { left: close, op: '>', right: num(1.5) },
      { left: close, op: '<', right: num(3.5) },
    ] as const
    expect(evaluateGroup({ mode: 'all', conditions: [...conds] }, c, {})).toEqual([false, true, true, false])
    expect(evaluateGroup({ mode: 'any', conditions: [...conds] }, c, {})).toEqual([true, true, true, true])
  })

  it('treats an empty group as never true', () => {
    expect(evaluateGroup({ mode: 'any', conditions: [] }, c, {})).toEqual([false, false, false, false])
  })
})

describe('setupToStrategy', () => {
  it('combines two indicators: long when close > SMA(2) and RSI(2) > 50, exit below SMA', () => {
    const setup: Setup = {
      name: 'combo',
      indicators: [
        { id: 'ma', defId: 'sma', params: { length: 2, source: 0 } },
        { id: 'r', defId: 'rsi', params: { length: 2, source: 0 } },
      ],
      entryLong: {
        mode: 'all',
        conditions: [
          { left: close, op: '>', right: { kind: 'indicator', instanceId: 'ma', output: 'value' } },
          { left: { kind: 'indicator', instanceId: 'r', output: 'value' }, op: '>', right: num(50) },
        ],
      },
      exitLong: {
        mode: 'all',
        conditions: [{ left: close, op: '<', right: { kind: 'indicator', instanceId: 'ma', output: 'value' } }],
      },
      entryShort: { mode: 'all', conditions: [] },
      exitShort: { mode: 'all', conditions: [] },
    }
    // SMA(2) = [-, 1.5, 2.5, 2.5, 1.5]; RSI(2) = [-, -, 100, 50, 25]
    const t = setupToStrategy(setup).targets(fromCloses([1, 2, 3, 2, 1]), {})
    expect(t).toEqual([0, 0, 1, 0, 0])
  })
})

describe('indicator catalog', () => {
  const candles = syntheticCandles(400, 3).map((c) => ({ ...c, takerBuyVolume: c.volume * 0.6 }))

  it.each(INDICATORS.map((d) => [d.name, d] as const))('%s computes aligned outputs', (_, def) => {
    const params = Object.fromEntries(def.params.map((x) => [x.key, x.default]))
    const out = def.compute(candles, params)
    expect(Object.keys(out).sort()).toEqual([...def.outputs].sort())
    for (const series of Object.values(out)) {
      expect(series).toHaveLength(candles.length)
      expect(Number.isFinite(series[series.length - 1])).toBe(true)
    }
  })

  it('volume delta is taker buy minus taker sell', () => {
    const c = fromCloses([1, 2]).map((x) => ({ ...x, volume: 10, takerBuyVolume: 7 }))
    const out = INDICATORS.find((d) => d.id === 'delta')!.compute(c, { length: 2 })
    expect(out.delta).toEqual([4, 4])
    expect(out.cvd).toEqual([4, 8])
  })

  it('flags a bullish liquidity sweep when a wick takes the range low and closes back inside', () => {
    const bars: Candle[] = [
      { time: 0, open: 10, high: 11, low: 9, close: 10, volume: 1 },
      { time: 1, open: 10, high: 11, low: 9.5, close: 10, volume: 1 },
      { time: 2, open: 10, high: 10.5, low: 8.5, close: 9.8, volume: 1 }, // sweeps 9, closes back above
      { time: 3, open: 9.8, high: 10, low: 8, close: 8.2, volume: 1 }, // breaks 8.5 and stays below
    ]
    const out = INDICATORS.find((d) => d.id === 'sweep')!.compute(bars, { length: 2 })
    expect(out.bull).toEqual([0, 0, 1, 0])
  })
})

describe('no look-ahead', () => {
  const candles = syntheticCandles(1500, 7).map((c) => ({ ...c, takerBuyVolume: c.volume * 0.5 }))

  it.each(PRESETS.map((s) => [s.name, s] as const))(
    '%s: targets on a prefix equal targets on the full series',
    (_, s) => {
      const strat = setupToStrategy(s)
      const full = strat.targets(candles, {})
      expect(strat.targets(candles.slice(0, 900), {})).toEqual(full.slice(0, 900))
    },
  )

  it('the Ticker preset produces trades on a long synthetic series', () => {
    const t = setupToStrategy(PRESETS[0]).targets(candles, {})
    expect(t.some((x) => x !== 0)).toBe(true)
  })
})

describe('presets', () => {
  it.each(PRESETS.map((s) => [s.name, s] as const))('%s reference only its own indicators', (_, s) => {
    const ids = new Set(s.indicators.map((i) => i.id))
    const groups = [s.entryLong, s.exitLong, s.entryShort, s.exitShort]
    for (const g of groups)
      for (const c of g.conditions)
        for (const o of [c.left, c.right]) if (o.kind === 'indicator') expect(ids.has(o.instanceId)).toBe(true)
  })
})
