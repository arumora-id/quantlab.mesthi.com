import type { Candle } from './types'

/** Timeframes an indicator can be computed on, in seconds. 'chart' = the loaded candles. */
export const TIMEFRAMES = { '1h': 3_600, '4h': 14_400, '12h': 43_200, '1d': 86_400, '1w': 604_800 } as const
export type HigherTf = keyof typeof TIMEFRAMES
export type IndicatorTf = 'chart' | HigherTf

const DAY = 86_400
/** Binance weeks open Monday 00:00 UTC; the UNIX epoch was a Thursday. */
const WEEK_OFFSET = 4 * DAY

/** Spacing of the loaded candles (median, so gaps do not skew it). */
export function baseSeconds(c: Candle[]): number {
  if (c.length < 2) return DAY
  const d = c.slice(1, 200).map((x, i) => x.time - c[i].time).sort((a, b) => a - b)
  return d[Math.floor(d.length / 2)]
}

const bucketStart = (t: number, tf: number) =>
  tf === TIMEFRAMES['1w'] ? Math.floor((t - WEEK_OFFSET) / tf) * tf + WEEK_OFFSET : Math.floor(t / tf) * tf

export interface Resampled {
  /** Completed higher-timeframe candles only. */
  bars: Candle[]
  /**
   * For every base candle: index into `bars` of the latest higher-timeframe candle that had
   * closed when this base candle closed, or -1. This is what prevents look-ahead.
   */
  visible: number[]
}

export function resample(c: Candle[], tfSeconds: number): Resampled {
  const base = baseSeconds(c)
  const hasTaker = c.every((x) => x.takerBuyVolume !== undefined)
  const bars: Candle[] = []
  const visible = new Array<number>(c.length).fill(-1)
  let i = 0
  let lastClosed = -1
  while (i < c.length) {
    const start = bucketStart(c[i].time, tfSeconds)
    const end = start + tfSeconds
    let j = i
    const agg: Candle = { ...c[i], time: start, takerBuyVolume: c[i].takerBuyVolume ?? 0 }
    while (j + 1 < c.length && c[j + 1].time < end) {
      j++
      agg.high = Math.max(agg.high, c[j].high)
      agg.low = Math.min(agg.low, c[j].low)
      agg.close = c[j].close
      agg.volume += c[j].volume
      agg.takerBuyVolume! += c[j].takerBuyVolume ?? 0
    }
    if (!hasTaker) delete agg.takerBuyVolume
    // complete = starts at the bucket open and its last candle closes at the bucket close
    const complete = c[i].time === start && c[j].time + base >= end
    for (let k = i; k < j; k++) visible[k] = lastClosed
    if (complete) {
      bars.push(agg)
      lastClosed = bars.length - 1
    }
    visible[j] = lastClosed // the bucket's last candle closes together with the bucket
    i = j + 1
  }
  return { bars, visible }
}

/** Maps series computed on resampled bars back onto the base candles. */
export function mapToBase(series: Record<string, number[]>, visible: number[]): Record<string, number[]> {
  return Object.fromEntries(
    Object.entries(series).map(([k, v]) => [k, visible.map((idx) => (idx < 0 ? NaN : v[idx]))]),
  )
}
