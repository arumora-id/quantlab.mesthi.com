import type { Condition, Operand, Setup } from './rules'

const close: Operand = { kind: 'price', field: 'close' }
const num = (value: number): Operand => ({ kind: 'number', value })
const ind = (instanceId: string, output = 'value'): Operand => ({ kind: 'indicator', instanceId, output })
const all = (...conditions: Condition[]) => ({ mode: 'all' as const, conditions })
const any = (...conditions: Condition[]) => ({ mode: 'any' as const, conditions })
const none = () => all()

/** Starting points. They are examples to edit and compare, not recommendations. */
export const PRESETS: Setup[] = [
  {
    // Turtle-style Donchian breakout, traded only in the direction of the weekly trend
    name: 'MTF: Weekly Trend + Donchian Breakout',
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
