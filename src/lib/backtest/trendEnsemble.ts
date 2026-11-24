import { highest, lowest } from './indicators'
import { baseSeconds } from './timeframe'
import type { Candle } from './types'

/**
 * Long-only trend ensemble after Zarattini, Pagani & Barbon, "Catching Crypto Trends" (2025), as summarised
 * for this project: for each lookback N, go long when the close is the highest close of the last N bars;
 * the stop starts at the middle of the N-bar close channel and then only rises, using the previous bar's
 * middle; go to cash when the close is at or below the stop. The models are equally weighted, then the
 * position is scaled to a target annual volatility measured on recent returns.
 */
export interface TrendEnsembleParams {
  lookbacks: number[]
  /** Target annualised volatility, in percent. */
  targetVol: number
  /** Bars of returns used to measure volatility (about 3 months of daily bars). */
  volLookback: number
  /** Cap on the weight; 1 = never more than 100% of equity (no leverage). */
  maxWeight: number
}

export const ZARATTINI_LOOKBACKS = [5, 10, 20, 30, 60, 90, 150, 250, 360]

/** 1 while one breakout model is long, 0 while in cash. */
export function breakoutModel(closes: number[], n: number): number[] {
  const hi = highest(closes, n)
  const lo = lowest(closes, n)
  const mid = hi.map((h, i) => (h + lo[i]) / 2)
  const out = new Array<number>(closes.length).fill(0)
  let inPos = false
  let stop = NaN
  for (let i = 0; i < closes.length; i++) {
    if (Number.isNaN(hi[i])) continue
    if (inPos) {
      if (i > 0 && !Number.isNaN(mid[i - 1])) stop = Math.max(stop, mid[i - 1])
      if (closes[i] <= stop) inPos = false
    } else if (closes[i] >= hi[i]) {
      inPos = true
      stop = mid[i]
    }
    out[i] = inPos ? 1 : 0
  }
  return out
}

/** Annualised volatility of simple returns over the last `n` bars. */
export function realizedVol(closes: number[], n: number, periodsPerYear: number): number[] {
  const r = closes.map((c, i) => (i === 0 ? NaN : c / closes[i - 1] - 1))
  return r.map((_, i) => {
    if (i < n) return NaN
    const w = r.slice(i - n + 1, i + 1)
    const mean = w.reduce((a, b) => a + b, 0) / n
    const v = w.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)
    return Math.sqrt(v * periodsPerYear)
  })
}

export function trendEnsembleWeights(candles: Candle[], p: TrendEnsembleParams): number[] {
  const closes = candles.map((c) => c.close)
  const models = p.lookbacks.map((n) => breakoutModel(closes, n))
  const periodsPerYear = (365 * 86_400) / baseSeconds(candles)
  const vol = realizedVol(closes, p.volLookback, periodsPerYear)
  return closes.map((_, i) => {
    const signal = models.reduce((a, m) => a + m[i], 0) / models.length
    if (signal === 0 || !(vol[i] > 0)) return 0
    return signal * Math.min(p.maxWeight, p.targetVol / 100 / vol[i])
  })
}
