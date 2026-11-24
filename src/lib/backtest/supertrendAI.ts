import { rma } from './indicators'
import type { Candle } from './types'

/**
 * SuperTrend AI (Clustering) — concept by LuxAlgo (https://www.tradingview.com/script/wP7WWjLL/, CC BY-NC-SA 4.0,
 * https://www.luxalgo.com/library/license/). Written for QuantLab from the formulas summarised by the Methoda
 * research agent, not translated from the original code. As an adaptation, this file is licensed under
 * CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/): attribution to LuxAlgo, non-commercial
 * use only, and adaptations must keep the same license.
 *
 * Per bar: run one SuperTrend per factor (min..max by step); score each with an exponentially smoothed
 * "return in the direction of the line"; cluster the scores with 1-D K-means (K = 3, initial centroids at the
 * 25/50/75th percentiles); take the average factor of the chosen cluster (best = highest centroid) and run a
 * final SuperTrend with it. Signals flip on closes only.
 *
 * QuantLab assumptions (not from LuxAlgo): an empty cluster keeps its previous centroid; if the chosen cluster
 * is empty the highest non-empty one is used; the position is 0 until the first flip (no forced initial short);
 * clustering runs on every bar (causal) instead of only on the chart's last 10,000 bars.
 */
export interface SupertrendAIParams {
  atrLength: number
  minFactor: number
  maxFactor: number
  step: number
  perfMemory: number
  /** 0 = worst, 1 = average, 2 = best cluster. */
  cluster: number
  maxIter: number
}

interface Band {
  upper: number
  lower: number
  trend: number
  output: number
  perf: number
}

function percentile(sorted: number[], p: number) {
  const rank = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo)
}

/** 1-D K-means with 3 clusters; returns the members' indices per cluster (ordered by initial centroid). */
export function kmeans3(values: number[], maxIter: number): number[][] {
  const sorted = [...values].sort((a, b) => a - b)
  let centroids = [25, 50, 75].map((p) => percentile(sorted, p))
  let clusters: number[][] = [[], [], []]
  for (let it = 0; it < maxIter; it++) {
    clusters = [[], [], []]
    values.forEach((v, i) => {
      let best = 0
      for (let k = 1; k < 3; k++) if (Math.abs(v - centroids[k]) < Math.abs(v - centroids[best])) best = k
      clusters[best].push(i)
    })
    const next = clusters.map((m, k) => (m.length ? m.reduce((a, i) => a + values[i], 0) / m.length : centroids[k]))
    if (next.every((c, k) => c === centroids[k])) break
    centroids = next
  }
  return clusters
}

const stepBand = (b: Band, c: Candle, prevClose: number, up: number, dn: number) => {
  // trend from the previous bands, then ratchet the bands
  if (c.close > b.upper) b.trend = 1
  else if (c.close < b.lower) b.trend = 0
  b.upper = prevClose < b.upper ? Math.min(up, b.upper) : up
  b.lower = prevClose > b.lower ? Math.max(dn, b.lower) : dn
  b.output = b.trend === 1 ? b.lower : b.upper
}

export function supertrendAI(c: Candle[], p: SupertrendAIParams): Record<string, number[]> {
  const n = c.length
  const tr = c.map((x, i) =>
    i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close)),
  )
  const atr = rma(tr, p.atrLength)
  const factors: number[] = []
  for (let f = p.minFactor; f <= p.maxFactor + 1e-9; f += p.step) factors.push(Math.round(f * 1e6) / 1e6)
  const alpha = 2 / (p.perfMemory + 1)

  const signal = new Array<number>(n).fill(0)
  const stop = new Array<number>(n).fill(NaN)
  const factor = new Array<number>(n).fill(NaN)
  const perfIdx = new Array<number>(n).fill(NaN)

  let bands: Band[] | null = null
  let final: Band | null = null
  let os = -1 // unknown until the first flip
  let absEma = NaN

  for (let i = 0; i < n; i++) {
    const bar = c[i]
    const hl2 = (bar.high + bar.low) / 2
    if (i > 0) {
      const move = Math.abs(bar.close - c[i - 1].close)
      absEma = Number.isNaN(absEma) ? move : absEma + alpha * (move - absEma)
    }
    if (Number.isNaN(atr[i])) continue
    if (!bands) {
      bands = factors.map(() => ({ upper: hl2, lower: hl2, trend: 0, output: hl2, perf: 0 }))
      final = { upper: hl2, lower: hl2, trend: 0, output: hl2, perf: 0 }
      continue
    }
    const prevClose = c[i - 1].close
    bands.forEach((b, k) => {
      const diff = Math.sign(prevClose - b.output)
      b.perf += alpha * ((bar.close - prevClose) * diff - b.perf)
      stepBand(b, bar, prevClose, hl2 + atr[i] * factors[k], hl2 - atr[i] * factors[k])
    })

    const perfs = bands.map((b) => b.perf)
    const clusters = kmeans3(perfs, p.maxIter)
    let chosen = clusters[p.cluster]
    for (let k = p.cluster; !chosen.length && k >= 0; k--) chosen = clusters[k]
    if (!chosen.length) chosen = clusters.find((m) => m.length)!
    const target = chosen.reduce((a, k) => a + factors[k], 0) / chosen.length
    const avgPerf = chosen.reduce((a, k) => a + perfs[k], 0) / chosen.length
    factor[i] = target
    perfIdx[i] = absEma > 0 ? Math.max(avgPerf, 0) / absEma : 0

    const f = final!
    const prevUpper = f.upper
    const prevLower = f.lower
    f.upper = prevClose < prevUpper ? Math.min(hl2 + atr[i] * target, prevUpper) : hl2 + atr[i] * target
    f.lower = prevClose > prevLower ? Math.max(hl2 - atr[i] * target, prevLower) : hl2 - atr[i] * target
    if (bar.close > prevUpper) os = 1
    else if (bar.close < prevLower) os = 0
    stop[i] = os === 1 ? f.lower : os === 0 ? f.upper : NaN
    signal[i] = os === 1 ? 1 : os === 0 ? -1 : 0
  }
  return { signal, stop, factor, perfIdx }
}
