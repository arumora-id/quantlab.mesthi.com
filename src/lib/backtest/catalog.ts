import {
  bollinger,
  ema,
  highest,
  lowest,
  rma,
  rsi,
  shift,
  sma,
  stdev,
  sum,
  wma,
} from './indicators'
import type { Candle, ParamDef } from './types'

type Series = number[]
type Outputs = Record<string, Series>

export type IndicatorCategory =
  | 'Trend'
  | 'Momentum'
  | 'Volatilitas'
  | 'Volume'
  | 'Order Flow'
  | 'Likuiditas'
  | 'Sinyal'

/** Where an indicator is drawn: on the price pane, in its own pane, or as markers. */
export type Placement = 'overlay' | 'pane' | 'markers'

export interface IndicatorDef {
  id: string
  name: string
  category: IndicatorCategory
  placement: Placement
  params: ParamDef[]
  outputs: string[]
  /** Short help shown in the builder. */
  note?: string
  /** Outputs have unrelated scales: chart each output in its own pane. */
  separatePanes?: boolean
  compute: (candles: Candle[], p: Record<string, number>) => Outputs
}

export const SOURCES = ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'] as const
export type Source = (typeof SOURCES)[number]

export function source(c: Candle[], s: Source): Series {
  switch (s) {
    case 'open':
      return c.map((x) => x.open)
    case 'high':
      return c.map((x) => x.high)
    case 'low':
      return c.map((x) => x.low)
    case 'hl2':
      return c.map((x) => (x.high + x.low) / 2)
    case 'hlc3':
      return c.map((x) => (x.high + x.low + x.close) / 3)
    case 'ohlc4':
      return c.map((x) => (x.open + x.high + x.low + x.close) / 4)
    default:
      return c.map((x) => x.close)
  }
}

const p = (key: string, label: string, def: number, min: number, max: number, step = 1): ParamDef => ({
  key,
  label,
  default: def,
  min,
  max,
  step,
})
const len = (def: number, label = 'Panjang') => p('length', label, def, 1, 500)

const closes = (c: Candle[]) => source(c, 'close')
const highs = (c: Candle[]) => source(c, 'high')
const lows = (c: Candle[]) => source(c, 'low')
const vols = (c: Candle[]) => c.map((x) => x.volume)

function trueRange(c: Candle[]): Series {
  return c.map((x, i) =>
    i === 0
      ? x.high - x.low
      : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close)),
  )
}
const atr = (c: Candle[], n: number) => rma(trueRange(c), n)

/** Taker buy minus taker sell volume per bar; NaN when the source has no taker data. */
const takerDelta = (c: Candle[]) =>
  c.map((x) => (x.takerBuyVolume === undefined ? NaN : 2 * x.takerBuyVolume - x.volume))

function hma(v: Series, n: number): Series {
  const half = wma(v, Math.max(1, Math.floor(n / 2)))
  const full = wma(v, n)
  return wma(
    half.map((h, i) => 2 * h - full[i]),
    Math.max(1, Math.round(Math.sqrt(n))),
  )
}

function supertrend(c: Candle[], n: number, mult: number): Outputs {
  const a = atr(c, n)
  const value = new Array<number>(c.length).fill(NaN)
  const direction = new Array<number>(c.length).fill(NaN)
  let upper = NaN
  let lower = NaN
  let dir = 1
  for (let i = 0; i < c.length; i++) {
    if (Number.isNaN(a[i])) continue
    const mid = (c[i].high + c[i].low) / 2
    const bu = mid + mult * a[i]
    const bl = mid - mult * a[i]
    const prevClose = i > 0 ? c[i - 1].close : c[i].close
    upper = Number.isNaN(upper) || bu < upper || prevClose > upper ? bu : upper
    lower = Number.isNaN(lower) || bl > lower || prevClose < lower ? bl : lower
    if (dir === 1 && c[i].close < lower) dir = -1
    else if (dir === -1 && c[i].close > upper) dir = 1
    value[i] = dir === 1 ? lower : upper
    direction[i] = dir
  }
  return { value, direction }
}

function parabolicSar(c: Candle[], start: number, inc: number, max: number): Outputs {
  const value = new Array<number>(c.length).fill(NaN)
  const direction = new Array<number>(c.length).fill(NaN)
  if (c.length < 2) return { value, direction }
  let up = c[1].close >= c[0].close
  let sar = up ? c[0].low : c[0].high
  let ep = up ? c[0].high : c[0].low
  let af = start
  for (let i = 1; i < c.length; i++) {
    sar = sar + af * (ep - sar)
    if (up) {
      sar = Math.min(sar, c[i - 1].low, i > 1 ? c[i - 2].low : c[i - 1].low)
      if (c[i].low < sar) {
        up = false
        sar = ep
        ep = c[i].low
        af = start
      } else if (c[i].high > ep) {
        ep = c[i].high
        af = Math.min(max, af + inc)
      }
    } else {
      sar = Math.max(sar, c[i - 1].high, i > 1 ? c[i - 2].high : c[i - 1].high)
      if (c[i].high > sar) {
        up = true
        sar = ep
        ep = c[i].high
        af = start
      } else if (c[i].low < ep) {
        ep = c[i].low
        af = Math.min(max, af + inc)
      }
    }
    value[i] = sar
    direction[i] = up ? 1 : -1
  }
  return { value, direction }
}

function adx(c: Candle[], n: number): Outputs {
  const plusDm = c.map((x, i) => {
    if (i === 0) return 0
    const upMove = x.high - c[i - 1].high
    const downMove = c[i - 1].low - x.low
    return upMove > downMove && upMove > 0 ? upMove : 0
  })
  const minusDm = c.map((x, i) => {
    if (i === 0) return 0
    const upMove = x.high - c[i - 1].high
    const downMove = c[i - 1].low - x.low
    return downMove > upMove && downMove > 0 ? downMove : 0
  })
  const tr = rma(trueRange(c), n)
  const plus = rma(plusDm, n).map((v, i) => (100 * v) / tr[i])
  const minus = rma(minusDm, n).map((v, i) => (100 * v) / tr[i])
  const dx = plus.map((pv, i) => {
    const s = pv + minus[i]
    return s === 0 ? 0 : (100 * Math.abs(pv - minus[i])) / s
  })
  return { adx: rma(dx, n), plusDI: plus, minusDI: minus }
}

function stochK(c: Candle[], n: number, src: Series = closes(c), hi = highs(c), lo = lows(c)): Series {
  const hh = highest(hi, n)
  const ll = lowest(lo, n)
  return src.map((v, i) => (hh[i] === ll[i] ? 50 : (100 * (v - ll[i])) / (hh[i] - ll[i])))
}

function pivotConfirmed(c: Candle[], j: number, k: number, dir: 'low' | 'high') {
  const v = dir === 'low' ? c[j].low : c[j].high
  for (let m = j - k; m <= j + k; m++) {
    if (m === j) continue
    const o = dir === 'low' ? c[m].low : c[m].high
    // strict on the left, non-strict on the right: a flat extreme pivots on its first bar
    const beats = dir === 'low' ? (m < j ? v < o : v <= o) : m < j ? v > o : v >= o
    if (!beats) return false
  }
  return true
}

/**
 * Single-timeframe adaptation of Ticker's "Analisis divergence multitimeframe" skill
 * (original: EMA 200 bias on 4H, RSI 14 regular divergence on 15M, structure break on 1M).
 * Pivots are used only once confirmed `swing` bars later, so there is no look-ahead.
 * Output `signal` is the target position: 1 long, -1 short, 0 flat.
 */
function tickerDivergence(c: Candle[], p: Record<string, number>): Outputs {
  const cl = closes(c)
  const trend = ema(cl, p.trend)
  const r = rsi(cl, p.rsi)
  const k = p.swing
  const lowPivots: { price: number; rsi: number }[] = []
  const highPivots: { price: number; rsi: number }[] = []
  let armedLong: { level: number; until: number } | null = null
  let armedShort: { level: number; until: number } | null = null
  let pos = 0
  const signal = c.map((bar, i) => {
    const bias = Number.isNaN(trend[i]) ? 0 : bar.close > trend[i] ? 1 : bar.close < trend[i] ? -1 : 0
    const j = i - k
    if (j >= k) {
      if (pivotConfirmed(c, j, k, 'high')) {
        highPivots.push({ price: c[j].high, rsi: r[j] })
        if (armedLong) armedLong.level = c[j].high
        const [a, b] = highPivots.slice(-2)
        if (a && b && bias === -1 && b.price > a.price && b.rsi < a.rsi && lowPivots.length)
          armedShort = { level: lowPivots[lowPivots.length - 1].price, until: i + p.wait }
      }
      if (pivotConfirmed(c, j, k, 'low')) {
        lowPivots.push({ price: c[j].low, rsi: r[j] })
        if (armedShort) armedShort.level = c[j].low
        const [a, b] = lowPivots.slice(-2)
        if (a && b && bias === 1 && b.price < a.price && b.rsi > a.rsi && highPivots.length)
          armedLong = { level: highPivots[highPivots.length - 1].price, until: i + p.wait }
      }
    }
    if (armedLong && (bias !== 1 || i > armedLong.until)) armedLong = null
    if (armedShort && (bias !== -1 || i > armedShort.until)) armedShort = null
    if (pos === 1 && bias !== 1) pos = 0
    if (pos === -1 && bias !== -1) pos = 0
    if (armedLong && bar.close > armedLong.level) {
      pos = 1
      armedLong = null
    } else if (armedShort && bar.close < armedShort.level) {
      pos = -1
      armedShort = null
    }
    return pos
  })
  return { signal }
}

const srcParam = p('source', 'Sumber', 0, 0, 6)
const pickSource = (c: Candle[], v: number) => source(c, SOURCES[v] ?? 'close')

export const INDICATORS: IndicatorDef[] = [
  // ---------- Trend ----------
  {
    id: 'price', name: 'Price (OHLC)', category: 'Trend', placement: 'overlay', params: [], outputs: ['close', 'open', 'high', 'low'],
    note: 'Berguna dengan timeframe lebih besar, mis. close mingguan sebagai filter tren.',
    compute: (c) => ({ close: closes(c), open: source(c, 'open'), high: highs(c), low: lows(c) }),
  },
  {
    id: 'sma', name: 'SMA', category: 'Trend', placement: 'overlay', params: [len(20), srcParam], outputs: ['value'],
    compute: (c, q) => ({ value: sma(pickSource(c, q.source), q.length) }),
  },
  {
    id: 'ema', name: 'EMA', category: 'Trend', placement: 'overlay', params: [len(20), srcParam], outputs: ['value'],
    compute: (c, q) => ({ value: ema(pickSource(c, q.source), q.length) }),
  },
  {
    id: 'wma', name: 'WMA', category: 'Trend', placement: 'overlay', params: [len(20), srcParam], outputs: ['value'],
    compute: (c, q) => ({ value: wma(pickSource(c, q.source), q.length) }),
  },
  {
    id: 'hma', name: 'Hull MA', category: 'Trend', placement: 'overlay', params: [len(21), srcParam], outputs: ['value'],
    compute: (c, q) => ({ value: hma(pickSource(c, q.source), q.length) }),
  },
  {
    id: 'dema', name: 'DEMA', category: 'Trend', placement: 'overlay', params: [len(20)], outputs: ['value'],
    compute: (c, q) => {
      const e1 = ema(closes(c), q.length)
      const e2 = ema(e1, q.length)
      return { value: e1.map((v, i) => 2 * v - e2[i]) }
    },
  },
  {
    id: 'tema', name: 'TEMA', category: 'Trend', placement: 'overlay', params: [len(20)], outputs: ['value'],
    compute: (c, q) => {
      const e1 = ema(closes(c), q.length)
      const e2 = ema(e1, q.length)
      const e3 = ema(e2, q.length)
      return { value: e1.map((v, i) => 3 * v - 3 * e2[i] + e3[i]) }
    },
  },
  {
    id: 'vwma', name: 'VWMA', category: 'Trend', placement: 'overlay', params: [len(20)], outputs: ['value'],
    compute: (c, q) => {
      const pv = sma(c.map((x) => x.close * x.volume), q.length)
      const v = sma(vols(c), q.length)
      return { value: pv.map((x, i) => x / v[i]) }
    },
  },
  {
    id: 'vwap', name: 'VWAP (rolling)', category: 'Trend', placement: 'overlay', params: [len(30)], outputs: ['value'],
    note: 'VWAP bergulir N bar; VWAP per sesi tidak bermakna di timeframe harian.',
    compute: (c, q) => {
      const pv = sum(c.map((x) => ((x.high + x.low + x.close) / 3) * x.volume), q.length)
      const v = sum(vols(c), q.length)
      return { value: pv.map((x, i) => x / v[i]) }
    },
  },
  {
    id: 'supertrend', name: 'Supertrend', category: 'Trend', placement: 'overlay',
    params: [p('length', 'ATR', 10, 1, 100), p('mult', 'Faktor', 3, 0.5, 10, 0.1)], outputs: ['value', 'direction'],
    note: 'direction = 1 naik, -1 turun.',
    compute: (c, q) => supertrend(c, q.length, q.mult),
  },
  {
    id: 'psar', name: 'Parabolic SAR', category: 'Trend', placement: 'overlay',
    params: [p('start', 'Start', 0.02, 0.001, 0.2, 0.001), p('inc', 'Increment', 0.02, 0.001, 0.2, 0.001), p('max', 'Max', 0.2, 0.01, 1, 0.01)],
    outputs: ['value', 'direction'],
    compute: (c, q) => parabolicSar(c, q.start, q.inc, q.max),
  },
  {
    id: 'ichimoku', name: 'Ichimoku Cloud', category: 'Trend', placement: 'overlay',
    params: [p('conv', 'Tenkan', 9, 1, 100), p('base', 'Kijun', 26, 1, 200), p('spanB', 'Span B', 52, 1, 300), p('disp', 'Displacement', 26, 1, 100)],
    outputs: ['tenkan', 'kijun', 'spanA', 'spanB'],
    note: 'Span A/B digeser ke depan seperti TradingView; Chikou tidak disertakan karena melihat ke depan.',
    compute: (c, q) => {
      const mid = (n: number) => {
        const h = highest(highs(c), n)
        const l = lowest(lows(c), n)
        return h.map((v, i) => (v + l[i]) / 2)
      }
      const tenkan = mid(q.conv)
      const kijun = mid(q.base)
      const a = tenkan.map((v, i) => (v + kijun[i]) / 2)
      return { tenkan, kijun, spanA: shift(a, q.disp - 1), spanB: shift(mid(q.spanB), q.disp - 1) }
    },
  },
  {
    id: 'adx', name: 'ADX / DMI', category: 'Trend', placement: 'pane', params: [len(14)], outputs: ['adx', 'plusDI', 'minusDI'],
    compute: (c, q) => adx(c, q.length),
  },
  {
    id: 'aroon', name: 'Aroon', category: 'Trend', placement: 'pane', params: [len(14)], outputs: ['up', 'down'],
    compute: (c, q) => {
      const n = q.length
      const up = c.map((_, i) => {
        if (i < n) return NaN
        const w = c.slice(i - n, i + 1).map((x) => x.high)
        return (100 * w.lastIndexOf(Math.max(...w))) / n
      })
      const down = c.map((_, i) => {
        if (i < n) return NaN
        const w = c.slice(i - n, i + 1).map((x) => x.low)
        return (100 * w.lastIndexOf(Math.min(...w))) / n
      })
      return { up, down }
    },
  },
  // ---------- Momentum ----------
  {
    id: 'rsi', name: 'RSI', category: 'Momentum', placement: 'pane', params: [len(14), srcParam], outputs: ['value'],
    compute: (c, q) => ({ value: rsi(pickSource(c, q.source), q.length) }),
  },
  {
    id: 'stoch', name: 'Stochastic', category: 'Momentum', placement: 'pane',
    params: [p('length', '%K', 14, 1, 200), p('smoothK', 'Smooth %K', 3, 1, 50), p('d', '%D', 3, 1, 50)], outputs: ['k', 'd'],
    compute: (c, q) => {
      const k = sma(stochK(c, q.length), q.smoothK)
      return { k, d: sma(k, q.d) }
    },
  },
  {
    id: 'stochrsi', name: 'Stochastic RSI', category: 'Momentum', placement: 'pane',
    params: [p('rsi', 'RSI', 14, 1, 200), p('length', 'Stoch', 14, 1, 200), p('smoothK', 'K', 3, 1, 50), p('d', 'D', 3, 1, 50)],
    outputs: ['k', 'd'],
    compute: (c, q) => {
      const r = rsi(closes(c), q.rsi)
      const k = sma(stochK(c, q.length, r, r, r), q.smoothK)
      return { k, d: sma(k, q.d) }
    },
  },
  {
    id: 'macd', name: 'MACD', category: 'Momentum', placement: 'pane',
    params: [p('fast', 'Fast', 12, 1, 200), p('slow', 'Slow', 26, 1, 400), p('signal', 'Signal', 9, 1, 100)],
    outputs: ['macd', 'signal', 'hist'],
    compute: (c, q) => {
      const f = ema(closes(c), q.fast)
      const s = ema(closes(c), q.slow)
      const macd = f.map((v, i) => v - s[i])
      const signal = ema(macd, q.signal)
      return { macd, signal, hist: macd.map((v, i) => v - signal[i]) }
    },
  },
  {
    id: 'cci', name: 'CCI', category: 'Momentum', placement: 'pane', params: [len(20)], outputs: ['value'],
    compute: (c, q) => {
      const tp = source(c, 'hlc3')
      const m = sma(tp, q.length)
      const value = tp.map((v, i) => {
        if (Number.isNaN(m[i])) return NaN
        let dev = 0
        for (let j = i - q.length + 1; j <= i; j++) dev += Math.abs(tp[j] - m[i])
        dev /= q.length
        return dev === 0 ? 0 : (v - m[i]) / (0.015 * dev)
      })
      return { value }
    },
  },
  {
    id: 'willr', name: 'Williams %R', category: 'Momentum', placement: 'pane', params: [len(14)], outputs: ['value'],
    compute: (c, q) => ({ value: stochK(c, q.length).map((v) => v - 100) }),
  },
  {
    id: 'roc', name: 'Rate of Change', category: 'Momentum', placement: 'pane', params: [len(9)], outputs: ['value'],
    compute: (c, q) => {
      const cl = closes(c)
      const prev = shift(cl, q.length)
      return { value: cl.map((v, i) => 100 * (v / prev[i] - 1)) }
    },
  },
  {
    id: 'mom', name: 'Momentum', category: 'Momentum', placement: 'pane', params: [len(10)], outputs: ['value'],
    compute: (c, q) => {
      const cl = closes(c)
      const prev = shift(cl, q.length)
      return { value: cl.map((v, i) => v - prev[i]) }
    },
  },
  {
    id: 'ao', name: 'Awesome Oscillator', category: 'Momentum', placement: 'pane', params: [], outputs: ['value'],
    compute: (c) => {
      const hl2 = source(c, 'hl2')
      const f = sma(hl2, 5)
      const s = sma(hl2, 34)
      return { value: f.map((v, i) => v - s[i]) }
    },
  },
  {
    id: 'tsi', name: 'True Strength Index', category: 'Momentum', placement: 'pane',
    params: [p('long', 'Long', 25, 1, 200), p('short', 'Short', 13, 1, 100), p('signal', 'Signal', 13, 1, 100)], outputs: ['tsi', 'signal'],
    compute: (c, q) => {
      const cl = closes(c)
      const m = cl.map((v, i) => (i === 0 ? NaN : v - cl[i - 1]))
      const num = ema(ema(m, q.long), q.short)
      const den = ema(ema(m.map(Math.abs), q.long), q.short)
      const tsi = num.map((v, i) => (100 * v) / den[i])
      return { tsi, signal: ema(tsi, q.signal) }
    },
  },
  {
    id: 'mfi', name: 'Money Flow Index', category: 'Momentum', placement: 'pane', params: [len(14)], outputs: ['value'],
    compute: (c, q) => {
      const tp = source(c, 'hlc3')
      const pos = tp.map((v, i) => (i > 0 && v > tp[i - 1] ? v * c[i].volume : 0))
      const neg = tp.map((v, i) => (i > 0 && v < tp[i - 1] ? v * c[i].volume : 0))
      const sp = sum(pos, q.length)
      const sn = sum(neg, q.length)
      return { value: sp.map((v, i) => (sn[i] === 0 ? 100 : 100 - 100 / (1 + v / sn[i]))) }
    },
  },
  // ---------- Volatility ----------
  {
    id: 'bb', name: 'Bollinger Bands', category: 'Volatilitas', placement: 'overlay',
    params: [len(20), p('mult', 'StdDev', 2, 0.1, 5, 0.1)], outputs: ['upper', 'middle', 'lower', 'percentB', 'width'],
    compute: (c, q) => {
      const b = bollinger(closes(c), q.length, q.mult)
      const cl = closes(c)
      return {
        ...b,
        percentB: cl.map((v, i) => (v - b.lower[i]) / (b.upper[i] - b.lower[i])),
        width: b.middle.map((m, i) => (b.upper[i] - b.lower[i]) / m),
      }
    },
  },
  {
    id: 'keltner', name: 'Keltner Channels', category: 'Volatilitas', placement: 'overlay',
    params: [len(20), p('mult', 'Multiplier', 2, 0.1, 10, 0.1), p('atr', 'ATR', 10, 1, 100)], outputs: ['upper', 'middle', 'lower'],
    compute: (c, q) => {
      const middle = ema(closes(c), q.length)
      const a = atr(c, q.atr)
      return {
        upper: middle.map((m, i) => m + q.mult * a[i]),
        middle,
        lower: middle.map((m, i) => m - q.mult * a[i]),
      }
    },
  },
  {
    id: 'donchian', name: 'Donchian Channels', category: 'Volatilitas', placement: 'overlay', params: [len(20)],
    outputs: ['upper', 'middle', 'lower', 'upperPrev', 'lowerPrev'],
    note: 'upper/lower termasuk bar saat ini, seperti TradingView. upperPrev/lowerPrev = kanal N bar sebelumnya; breakout: close > upperPrev.',
    compute: (c, q) => {
      const upper = highest(highs(c), q.length)
      const lower = lowest(lows(c), q.length)
      return {
        upper,
        lower,
        middle: upper.map((u, i) => (u + lower[i]) / 2),
        upperPrev: shift(upper, 1),
        lowerPrev: shift(lower, 1),
      }
    },
  },
  {
    id: 'atr', name: 'ATR', category: 'Volatilitas', placement: 'pane', params: [len(14)], outputs: ['value'],
    compute: (c, q) => ({ value: atr(c, q.length) }),
  },
  {
    id: 'stdev', name: 'Standard Deviation', category: 'Volatilitas', placement: 'pane', params: [len(20)], outputs: ['value'],
    compute: (c, q) => ({ value: stdev(closes(c), q.length) }),
  },
  // ---------- Volume ----------
  {
    id: 'volume', name: 'Volume + MA', category: 'Volume', placement: 'pane', params: [len(20, 'MA')], outputs: ['volume', 'ma'],
    compute: (c, q) => ({ volume: vols(c), ma: sma(vols(c), q.length) }),
  },
  {
    id: 'rvol', name: 'Relative Volume', category: 'Volume', placement: 'pane', params: [len(20)], outputs: ['value'],
    compute: (c, q) => {
      const ma = shift(sma(vols(c), q.length), 1)
      return { value: vols(c).map((v, i) => v / ma[i]) }
    },
  },
  {
    id: 'obv', name: 'On-Balance Volume', category: 'Volume', placement: 'pane', params: [], outputs: ['value'],
    compute: (c) => {
      let acc = 0
      return {
        value: c.map((x, i) => {
          if (i > 0) acc += x.close > c[i - 1].close ? x.volume : x.close < c[i - 1].close ? -x.volume : 0
          return acc
        }),
      }
    },
  },
  {
    id: 'ad', name: 'Accumulation/Distribution', category: 'Volume', placement: 'pane', params: [], outputs: ['value'],
    compute: (c) => {
      let acc = 0
      return {
        value: c.map((x) => {
          const range = x.high - x.low
          acc += range === 0 ? 0 : ((2 * x.close - x.low - x.high) / range) * x.volume
          return acc
        }),
      }
    },
  },
  {
    id: 'cmf', name: 'Chaikin Money Flow', category: 'Volume', placement: 'pane', params: [len(20)], outputs: ['value'],
    compute: (c, q) => {
      const mfv = c.map((x) => {
        const range = x.high - x.low
        return range === 0 ? 0 : ((2 * x.close - x.low - x.high) / range) * x.volume
      })
      const a = sum(mfv, q.length)
      const v = sum(vols(c), q.length)
      return { value: a.map((x, i) => x / v[i]) }
    },
  },
  // ---------- Order flow ----------
  {
    id: 'delta', name: 'Volume Delta & CVD', category: 'Order Flow', placement: 'pane',
    params: [len(20, 'Rolling delta')], outputs: ['delta', 'cvd', 'deltaPct', 'rollingDelta'], separatePanes: true,
    note: 'Delta = taker buy − taker sell per bar (dari kline Binance). Bukan data order book/footprint tick.',
    compute: (c, q) => {
      const delta = takerDelta(c)
      let acc = 0
      const cvd = delta.map((d) => (Number.isNaN(d) ? NaN : (acc += d)))
      return {
        delta,
        cvd,
        deltaPct: delta.map((d, i) => (c[i].volume ? (100 * d) / c[i].volume : 0)),
        rollingDelta: sum(delta, q.length),
      }
    },
  },
  {
    id: 'cvdDivergence', name: 'CVD Divergence', category: 'Order Flow', placement: 'markers',
    params: [len(20, 'Lookback')], outputs: ['bull', 'bear'],
    note: 'bull = harga membuat low baru N bar tapi CVD tidak; bear sebaliknya.',
    compute: (c, q) => {
      let acc = 0
      const cvd = takerDelta(c).map((d) => (acc += Number.isNaN(d) ? 0 : d))
      const prevLow = shift(lowest(lows(c), q.length), 1)
      const prevHigh = shift(highest(highs(c), q.length), 1)
      const prevCvdLow = shift(lowest(cvd, q.length), 1)
      const prevCvdHigh = shift(highest(cvd, q.length), 1)
      return {
        bull: c.map((x, i) => (x.low < prevLow[i] && cvd[i] > prevCvdLow[i] ? 1 : 0)),
        bear: c.map((x, i) => (x.high > prevHigh[i] && cvd[i] < prevCvdHigh[i] ? 1 : 0)),
      }
    },
  },
  // ---------- Liquidity ----------
  {
    id: 'sweep', name: 'Liquidity Sweep', category: 'Likuiditas', placement: 'markers',
    params: [len(20, 'Lookback range')], outputs: ['bull', 'bear', 'rangeHigh', 'rangeLow'],
    note: 'bull = wick menembus low N bar sebelumnya lalu close kembali di atasnya (sweep sell-side liquidity). bear kebalikannya.',
    compute: (c, q) => {
      const rangeHigh = shift(highest(highs(c), q.length), 1)
      const rangeLow = shift(lowest(lows(c), q.length), 1)
      return {
        bull: c.map((x, i) => (x.low < rangeLow[i] && x.close > rangeLow[i] ? 1 : 0)),
        bear: c.map((x, i) => (x.high > rangeHigh[i] && x.close < rangeHigh[i] ? 1 : 0)),
        rangeHigh,
        rangeLow,
      }
    },
  },
  {
    id: 'fvg', name: 'Fair Value Gap', category: 'Likuiditas', placement: 'markers', params: [], outputs: ['bull', 'bear'],
    note: 'bull = low bar ini > high dua bar sebelumnya; bear = high < low dua bar sebelumnya.',
    compute: (c) => ({
      bull: c.map((x, i) => (i >= 2 && x.low > c[i - 2].high ? 1 : 0)),
      bear: c.map((x, i) => (i >= 2 && x.high < c[i - 2].low ? 1 : 0)),
    }),
  },
  // ---------- Signals ----------
  {
    id: 'tickerDivergence', name: 'Ticker: EMA Bias + RSI Divergence + BOS', category: 'Sinyal', placement: 'markers',
    params: [p('trend', 'EMA bias', 200, 5, 400), p('rsi', 'RSI', 14, 2, 50), p('swing', 'Lebar swing', 3, 1, 10), p('wait', 'Tunggu BOS (bar)', 20, 1, 200)],
    outputs: ['signal'],
    note: 'signal 1 long, -1 short, 0 flat. Adaptasi satu timeframe dari metode 4H/15M/1M agent Ticker.',
    compute: tickerDivergence,
  },
]

export const INDICATOR_BY_ID = Object.fromEntries(INDICATORS.map((d) => [d.id, d]))

export function defaultIndicatorParams(def: IndicatorDef) {
  return Object.fromEntries(def.params.map((x) => [x.key, x.default]))
}
