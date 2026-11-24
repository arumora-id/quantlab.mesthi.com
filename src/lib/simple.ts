import type { Interval } from './backtest/binanceFutures'
import type { Metrics } from './backtest/types'

export const MAX_BARS = 50_000
const BARS_PER_DAY: Record<Interval, number> = {
  '1d': 1,
  '12h': 2,
  '8h': 3,
  '4h': 6,
  '1h': 24,
  '30m': 48,
  '15m': 96,
  '5m': 288,
  '1m': 1440,
}

/** Candles needed to cover `days` at this timeframe, capped at what the app loads. */
export const barsFor = (interval: Interval, days: number) =>
  Math.min(MAX_BARS, Math.ceil(days * (BARS_PER_DAY[interval])))

export const isCapped = (interval: Interval, days: number) =>
  Math.ceil(days * (BARS_PER_DAY[interval])) > MAX_BARS

export type Verdict = 'noTrades' | 'beat' | 'profitBehind' | 'loss'

/** One-line judgement for beginners, compared with buying and holding. */
export function verdictOf(m: Pick<Metrics, 'trades' | 'totalReturn' | 'benchmarkReturn'>): Verdict {
  if (m.trades === 0) return 'noTrades'
  if (m.totalReturn <= 0) return 'loss'
  return m.totalReturn >= m.benchmarkReturn ? 'beat' : 'profitBehind'
}
