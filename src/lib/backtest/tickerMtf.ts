import { ema, rsi } from './indicators'
import { pivotConfirmed } from './pivots'
import { htfContext, TIMEFRAMES, type HtfContext } from './timeframe'
import type { Candle } from './types'

interface Armed {
  /** Structure level the chart close must break. */
  level: number
  /** Divergence pivot: the protective stop after entry. */
  stop: number
  until: number
}

/**
 * Ticker's "Analisis divergence multitimeframe" skill on real timeframes:
 * 1. bias from the last closed 4H candle vs its EMA (default 200);
 * 2. a regular RSI divergence on closed 15M candles in the direction of the bias;
 * 3. entry when a chart (1M) candle closes beyond the last confirmed chart swing.
 * The skill gives no exit, so this adds one (not part of Ticker's method): stop at the divergence
 * pivot, target at `rr` times the risk, or flat when the 4H bias turns. All checks use closes only.
 * Output `signal`: 1 long, -1 short, 0 flat.
 */
export function tickerMtf(
  c: Candle[],
  p: Record<string, number>,
  ctx: HtfContext = htfContext(c),
): Record<string, number[]> {
  const h4 = ctx.htf(TIMEFRAMES['4h'])
  const m15 = ctx.htf(TIMEFRAMES['15m'])
  const ema4 = ema(
    h4.bars.map((b) => b.close),
    p.trend,
  )
  const rsi15 = rsi(
    m15.bars.map((b) => b.close),
    p.rsi,
  )
  const k15 = p.swing
  const k1 = p.bosSwing

  const lows15: { price: number; rsi: number }[] = []
  const highs15: { price: number; rsi: number }[] = []
  let seen15 = -1
  let lastHigh1: number | null = null
  let lastLow1: number | null = null
  let armedLong: Armed | null = null
  let armedShort: Armed | null = null
  let pos = 0
  let stop = NaN
  let target = NaN

  const signal = c.map((bar, i) => {
    const b4 = h4.visible[i]
    const bias = b4 < 0 || Number.isNaN(ema4[b4]) ? 0 : Math.sign(h4.bars[b4].close - ema4[b4])

    // newly closed 15M candles: confirm pivots and look for divergence in the bias direction
    while (seen15 < m15.visible[i]) {
      seen15++
      const j = seen15 - k15
      if (j < 0) continue
      if (pivotConfirmed(m15.bars, j, k15, 'low')) {
        lows15.push({ price: m15.bars[j].low, rsi: rsi15[j] })
        const [a, b] = lows15.slice(-2)
        if (a && b && bias === 1 && b.price < a.price && b.rsi > a.rsi && lastHigh1 !== null)
          armedLong = { level: lastHigh1, stop: b.price, until: i + p.wait }
      }
      if (pivotConfirmed(m15.bars, j, k15, 'high')) {
        highs15.push({ price: m15.bars[j].high, rsi: rsi15[j] })
        const [a, b] = highs15.slice(-2)
        if (a && b && bias === -1 && b.price > a.price && b.rsi < a.rsi && lastLow1 !== null)
          armedShort = { level: lastLow1, stop: b.price, until: i + p.wait }
      }
    }

    // chart swings, confirmed k1 bars later; the latest swing is the structure level
    const j1 = i - k1
    if (j1 >= 0) {
      if (pivotConfirmed(c, j1, k1, 'high')) {
        lastHigh1 = c[j1].high
        if (armedLong) armedLong.level = lastHigh1
      }
      if (pivotConfirmed(c, j1, k1, 'low')) {
        lastLow1 = c[j1].low
        if (armedShort) armedShort.level = lastLow1
      }
    }

    if (armedLong && (bias !== 1 || i > armedLong.until)) armedLong = null
    if (armedShort && (bias !== -1 || i > armedShort.until)) armedShort = null

    // exits (added rule, see above)
    if (pos === 1 && (bias !== 1 || bar.close <= stop || bar.close >= target)) pos = 0
    if (pos === -1 && (bias !== -1 || bar.close >= stop || bar.close <= target)) pos = 0

    if (pos === 0 && armedLong && bar.close > armedLong.level && armedLong.stop < bar.close) {
      pos = 1
      stop = armedLong.stop
      target = bar.close + p.rr * (bar.close - stop)
      armedLong = null
    } else if (pos === 0 && armedShort && bar.close < armedShort.level && armedShort.stop > bar.close) {
      pos = -1
      stop = armedShort.stop
      target = bar.close - p.rr * (stop - bar.close)
      armedShort = null
    }
    return pos
  })
  return { signal }
}
