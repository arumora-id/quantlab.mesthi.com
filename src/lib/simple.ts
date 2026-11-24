import type { Interval } from './backtest/binanceFutures'
import type { Metrics } from './backtest/types'

export const MAX_BARS = 5000
const BARS_PER_DAY: Partial<Record<Interval, number>> = { '1d': 1, '4h': 6, '1h': 24 }

/** Candles needed to cover `days` at this timeframe, capped at what the app loads. */
export const barsFor = (interval: Interval, days: number) =>
  Math.min(MAX_BARS, Math.ceil(days * (BARS_PER_DAY[interval] ?? 1)))

export const isCapped = (interval: Interval, days: number) =>
  Math.ceil(days * (BARS_PER_DAY[interval] ?? 1)) > MAX_BARS

export type Verdict = 'noTrades' | 'beat' | 'profitBehind' | 'loss'

/** One-line judgement for beginners, compared with buying and holding. */
export function verdictOf(m: Pick<Metrics, 'trades' | 'totalReturn' | 'benchmarkReturn'>): Verdict {
  if (m.trades === 0) return 'noTrades'
  if (m.totalReturn <= 0) return 'loss'
  return m.totalReturn >= m.benchmarkReturn ? 'beat' : 'profitBehind'
}
