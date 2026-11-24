import type { Condition, Operand, Setup } from './rules'
import { ZARATTINI_LOOKBACKS } from './trendEnsemble'

const close: Operand = { kind: 'price', field: 'close' }
const num = (value: number): Operand => ({ kind: 'number', value })
const ind = (instanceId: string, output = 'value'): Operand => ({ kind: 'indicator', instanceId, output })
const all = (...conditions: Condition[]) => ({ mode: 'all' as const, conditions })
const any = (...conditions: Condition[]) => ({ mode: 'any' as const, conditions })
const none = () => all()

/** Starting points. They are examples to edit and compare, not recommendations. */
export const PRESETS: Setup[] = [
  {
    // Zarattini, Pagani & Barbon (2025): nine breakout lookbacks, ratcheting stop, 25% vol target, long only
    name: 'Trend Ensemble (Zarattini 2025)',
    research: true,
    model: { kind: 'trendEnsemble', lookbacks: ZARATTINI_LOOKBACKS, targetVol: 25, volLookback: 90, maxWeight: 1, rebalanceBand: 0.1 },
    indicators: [],
    entryLong: none(),
    exitLong: none(),
    entryShort: none(),
    exitShort: none(),
  },
  {
    // control for the weekly filter below: the same breakout without it
    name: 'Donchian 20/10 Breakout',
    research: true,
    indicators: [
      { id: 'dc20', defId: 'donchian', params: { length: 20 } },
      { id: 'dc10', defId: 'donchian', params: { length: 10 } },
    ],
    entryLong: all({ left: close, op: '>', right: ind('dc20', 'upperPrev') }),
    exitLong: all({ left: close, op: '<', right: ind('dc10', 'lowerPrev') }),
    entryShort: all({ left: close, op: '<', right: ind('dc20', 'lowerPrev') }),
    exitShort: all({ left: close, op: '>', right: ind('dc10', 'upperPrev') }),
  },
  {
    // Turtle-style Donchian breakout, traded only in the direction of the weekly trend
    name: 'MTF: Weekly Trend + Donchian Breakout',
    research: true,
    indicators: [
      { id: 'wk', defId: 'price', params: {}, tf: '1w' },
      { id: 'wema', defId: 'ema', params: { length: 21, source: 0 }, tf: '1w' },
      { id: 'dc20', defId: 'donchian', params: { length: 20 } },
      { id: 'dc10', defId: 'donchian', params: { length: 10 } },
    ],
    entryLong: all(
      { left: ind('wk', 'close'), op: '>', right: ind('wema') },
      { left: close, op: '>', right: ind('dc20', 'upperPrev') },
    ),
    exitLong: any(
      { left: close, op: '<', right: ind('dc10', 'lowerPrev') },
      { left: ind('wk', 'close'), op: '<', right: ind('wema') },
    ),
    entryShort: all(
      { left: ind('wk', 'close'), op: '<', right: ind('wema') },
      { left: close, op: '<', right: ind('dc20', 'lowerPrev') },
    ),
    exitShort: any(
      { left: close, op: '>', right: ind('dc10', 'upperPrev') },
      { left: ind('wk', 'close'), op: '>', right: ind('wema') },
    ),
  },
  {
    // time-series momentum: 12-week return sets the direction, daily SMA 50 confirms
    name: 'MTF: Weekly Momentum + Daily Trend',
    research: true,
    indicators: [
      { id: 'wroc', defId: 'roc', params: { length: 12 }, tf: '1w' },
      { id: 'sma', defId: 'sma', params: { length: 50, source: 0 }, tf: '1d' },
    ],
    entryLong: all(
      { left: ind('wroc'), op: '>', right: num(0) },
      { left: close, op: '>', right: ind('sma') },
    ),
    exitLong: any(
      { left: ind('wroc'), op: '<', right: num(0) },
      { left: close, op: '<', right: ind('sma') },
    ),
    entryShort: all(
      { left: ind('wroc'), op: '<', right: num(0) },
      { left: close, op: '<', right: ind('sma') },
    ),
    exitShort: any(
      { left: ind('wroc'), op: '>', right: num(0) },
      { left: close, op: '>', right: ind('sma') },
    ),
  },
  {
    name: 'MTF: Weekly + Daily Supertrend',
    research: true,
    indicators: [
      { id: 'wst', defId: 'supertrend', params: { length: 10, mult: 3 }, tf: '1w' },
      { id: 'dst', defId: 'supertrend', params: { length: 10, mult: 3 }, tf: '1d' },
    ],
    entryLong: all(
      { left: ind('wst', 'direction'), op: '>', right: num(0) },
      { left: ind('dst', 'direction'), op: '>', right: num(0) },
    ),
    exitLong: any(
      { left: ind('wst', 'direction'), op: '<', right: num(0) },
      { left: ind('dst', 'direction'), op: '<', right: num(0) },
    ),
    entryShort: all(
      { left: ind('wst', 'direction'), op: '<', right: num(0) },
      { left: ind('dst', 'direction'), op: '<', right: num(0) },
    ),
    exitShort: any(
      { left: ind('wst', 'direction'), op: '>', right: num(0) },
      { left: ind('dst', 'direction'), op: '>', right: num(0) },
    ),
  },
  {
    // experiment spec from the Methoda research agent; a proxy, see fabioProxy.ts
    name: 'Fabio Valentini-inspired: Trend (NY open)',
    research: true,
    preferredInterval: '1m',
    model: { kind: 'fabioProxy', mode: 'trend', bins: 32, watch: 15, deltaMin: 0.2, riskPct: 0.25, maxWeight: 1, tickBps: 1 },
    indicators: [],
    entryLong: none(),
    exitLong: none(),
    entryShort: none(),
    exitShort: none(),
  },
  {
    name: 'Fabio Valentini-inspired: Reversion (London open)',
    research: true,
    preferredInterval: '1m',
    model: { kind: 'fabioProxy', mode: 'reversion', bins: 32, watch: 15, deltaMin: 0.2, riskPct: 0.25, maxWeight: 1, tickBps: 1 },
    indicators: [],
    entryLong: none(),
    exitLong: none(),
    entryShort: none(),
    exitShort: none(),
  },
  {
    // Ticker's skill on its real timeframes; the exit is a QuantLab addition (see tickerMtf.ts)
    name: 'Ticker Scalping: 4H + 15M + 1M',
    research: true,
    preferredInterval: '1m',
    indicators: [
      { id: 'tkm', defId: 'tickerMtf', params: { trend: 200, rsi: 14, swing: 3, bosSwing: 3, wait: 60, rr: 2 } },
    ],
    entryLong: all({ left: ind('tkm', 'signal'), op: '>', right: num(0) }),
    exitLong: all({ left: ind('tkm', 'signal'), op: '<', right: num(1) }),
    entryShort: all({ left: ind('tkm', 'signal'), op: '<', right: num(0) }),
    exitShort: all({ left: ind('tkm', 'signal'), op: '>', right: num(-1) }),
  },
  {
    // LuxAlgo concept (CC BY-NC-SA 4.0, non-commercial), rewritten from formulas; see supertrendAI.ts
    name: 'LuxAlgo SuperTrend AI (Clustering)',
    research: true,
    indicators: [
      {
        id: 'sai',
        defId: 'supertrendAI',
        params: { atrLength: 10, minFactor: 1, maxFactor: 5, step: 0.5, perfMemory: 10, cluster: 2, maxIter: 1000 },
      },
    ],
    entryLong: all({ left: ind('sai', 'signal'), op: '>', right: num(0) }),
    exitLong: all({ left: ind('sai', 'signal'), op: '<', right: num(1) }),
    entryShort: all({ left: ind('sai', 'signal'), op: '<', right: num(0) }),
    exitShort: all({ left: ind('sai', 'signal'), op: '>', right: num(-1) }),
  },
  {
    // QuantLab's own SMC-style structure: trade internal (5) breaks in the direction of the swing (50) structure
    name: 'SMC Structure (LuxAlgo-style)',
    research: true,
    indicators: [
      { id: 'int', defId: 'smcStructure', params: { length: 5 } },
      { id: 'sw', defId: 'smcStructure', params: { length: 50 } },
    ],
    entryLong: all(
      { left: ind('int', 'trend'), op: '>', right: num(0) },
      { left: ind('sw', 'trend'), op: '>', right: num(0) },
    ),
    exitLong: all({ left: ind('int', 'trend'), op: '<', right: num(0) }),
    entryShort: all(
      { left: ind('int', 'trend'), op: '<', right: num(0) },
      { left: ind('sw', 'trend'), op: '<', right: num(0) },
    ),
    exitShort: all({ left: ind('int', 'trend'), op: '>', right: num(0) }),
  },
  {
    name: 'Kalman Trend',
    research: true,
    indicators: [{ id: 'kf', defId: 'kalman', params: { smooth: 20, slopeRatio: 0.01 } }],
    entryLong: all(
      { left: ind('kf', 'slope'), op: '>', right: num(0) },
      { left: close, op: '>', right: ind('kf', 'value') },
    ),
    exitLong: all({ left: ind('kf', 'slope'), op: '<', right: num(0) }),
    entryShort: all(
      { left: ind('kf', 'slope'), op: '<', right: num(0) },
      { left: close, op: '<', right: ind('kf', 'value') },
    ),
    exitShort: all({ left: ind('kf', 'slope'), op: '>', right: num(0) }),
  },
  {
    name: 'Ticker: Divergence + BOS',
    indicators: [{ id: 'tk', defId: 'tickerDivergence', params: { trend: 200, rsi: 14, swing: 3, wait: 20 } }],
    entryLong: all({ left: ind('tk', 'signal'), op: '>', right: num(0) }),
    exitLong: all({ left: ind('tk', 'signal'), op: '<', right: num(1) }),
    entryShort: all({ left: ind('tk', 'signal'), op: '<', right: num(0) }),
    exitShort: all({ left: ind('tk', 'signal'), op: '>', right: num(-1) }),
  },
  {
    name: 'EMA 20/50 Cross',
    indicators: [
      { id: 'fast', defId: 'ema', params: { length: 20, source: 0 } },
      { id: 'slow', defId: 'ema', params: { length: 50, source: 0 } },
    ],
    entryLong: all({ left: ind('fast'), op: 'crossesAbove', right: ind('slow') }),
    exitLong: all({ left: ind('fast'), op: 'crossesBelow', right: ind('slow') }),
    entryShort: all({ left: ind('fast'), op: 'crossesBelow', right: ind('slow') }),
    exitShort: all({ left: ind('fast'), op: 'crossesAbove', right: ind('slow') }),
  },
  {
    name: 'Supertrend + ADX filter',
    indicators: [
      { id: 'st', defId: 'supertrend', params: { length: 10, mult: 3 } },
      { id: 'adx', defId: 'adx', params: { length: 14 } },
    ],
    entryLong: all(
      { left: ind('st', 'direction'), op: '>', right: num(0) },
      { left: ind('adx', 'adx'), op: '>', right: num(20) },
    ),
    exitLong: all({ left: ind('st', 'direction'), op: '<', right: num(0) }),
    entryShort: all(
      { left: ind('st', 'direction'), op: '<', right: num(0) },
      { left: ind('adx', 'adx'), op: '>', right: num(20) },
    ),
    exitShort: all({ left: ind('st', 'direction'), op: '>', right: num(0) }),
  },
  {
    name: 'RSI Reversion + EMA 200 trend',
    indicators: [
      { id: 'rsi', defId: 'rsi', params: { length: 14, source: 0 } },
      { id: 'trend', defId: 'ema', params: { length: 200, source: 0 } },
    ],
    entryLong: all(
      { left: ind('rsi'), op: 'crossesAbove', right: num(30) },
      { left: close, op: '>', right: ind('trend') },
    ),
    exitLong: any({ left: ind('rsi'), op: '>', right: num(70) }, { left: close, op: '<', right: ind('trend') }),
    entryShort: none(),
    exitShort: none(),
  },
  {
    name: 'Liquidity Sweep + CVD',
    indicators: [
      { id: 'sw', defId: 'sweep', params: { length: 20 } },
      { id: 'of', defId: 'delta', params: { length: 5 } },
      { id: 'mid', defId: 'ema', params: { length: 20, source: 0 } },
    ],
    entryLong: all(
      { left: ind('sw', 'bull'), op: '>', right: num(0) },
      { left: ind('of', 'rollingDelta'), op: '>', right: num(0) },
    ),
    exitLong: all({ left: close, op: 'crossesBelow', right: ind('mid') }),
    entryShort: all(
      { left: ind('sw', 'bear'), op: '>', right: num(0) },
      { left: ind('of', 'rollingDelta'), op: '<', right: num(0) },
    ),
    exitShort: all({ left: close, op: 'crossesAbove', right: ind('mid') }),
  },
  {
    name: 'Bollinger Reversion',
    indicators: [{ id: 'bb', defId: 'bb', params: { length: 20, mult: 2 } }],
    entryLong: all({ left: close, op: 'crossesBelow', right: ind('bb', 'lower') }),
    exitLong: all({ left: close, op: '>', right: ind('bb', 'middle') }),
    entryShort: all({ left: close, op: 'crossesAbove', right: ind('bb', 'upper') }),
    exitShort: all({ left: close, op: '<', right: ind('bb', 'middle') }),
  },
]
