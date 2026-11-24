import { pivotConfirmed } from './pivots'
import type { Candle } from './types'

/**
 * Market structure in the style of LuxAlgo's Smart Money Concepts — QuantLab's own definitions, because the
 * original pivot logic was not available (concept: https://www.tradingview.com/script/CnB3fSph/).
 *
 * A swing high/low is a pivot with `length` bars on each side, usable only once those right-side bars have
 * closed. A close above the latest unbroken swing high is a bullish break: CHoCH when the structure was bearish
 * or unknown, BOS when it was already bullish (mirror for lows). Outputs per bar:
 * trend (1 / -1 / 0 before the first break), bos and choch (+1 / -1 on the break bar), swingHigh / swingLow levels.
 */
export function smcStructure(c: Candle[], length: number): Record<string, number[]> {
  const n = c.length
  const trend = new Array<number>(n).fill(0)
  const bos = new Array<number>(n).fill(0)
  const choch = new Array<number>(n).fill(0)
  const swingHigh = new Array<number>(n).fill(NaN)
  const swingLow = new Array<number>(n).fill(NaN)
  let hi: { price: number; broken: boolean } | null = null
  let lo: { price: number; broken: boolean } | null = null
  let t = 0
  for (let i = 0; i < n; i++) {
    const j = i - length
    if (j >= length) {
      if (pivotConfirmed(c, j, length, 'high')) hi = { price: c[j].high, broken: false }
      if (pivotConfirmed(c, j, length, 'low')) lo = { price: c[j].low, broken: false }
    }
    const close = c[i].close
    if (hi && !hi.broken && close > hi.price) {
      hi.broken = true
      if (t === 1) bos[i] = 1
      else choch[i] = 1
      t = 1
    } else if (lo && !lo.broken && close < lo.price) {
      lo.broken = true
      if (t === -1) bos[i] = -1
      else choch[i] = -1
      t = -1
    }
    trend[i] = t
    swingHigh[i] = hi?.price ?? NaN
    swingLow[i] = lo?.price ?? NaN
  }
  return { trend, bos, choch, swingHigh, swingLow }
}
