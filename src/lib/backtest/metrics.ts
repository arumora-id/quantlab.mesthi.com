import type { EquityPoint, Metrics, Trade } from './types'

const YEAR_SECONDS = 365.25 * 86_400

export function computeMetrics(
  equity: EquityPoint[],
  trades: Trade[],
  barsInMarket: number,
  initialCapital: number,
): Metrics {
  const n = equity.length
  const finalEquity = n ? equity[n - 1].equity : initialCapital
  const totalReturn = finalEquity / initialCapital - 1
  const benchmarkReturn = n ? equity[n - 1].benchmark / initialCapital - 1 : 0
  const years = n > 1 ? (equity[n - 1].time - equity[0].time) / YEAR_SECONDS : 0
  const cagr = years > 0 && finalEquity > 0 ? (finalEquity / initialCapital) ** (1 / years) - 1 : -1

  let peak = initialCapital
  let maxDrawdown = 0
  const returns: number[] = []
  let prev = initialCapital
  for (const p of equity) {
    peak = Math.max(peak, p.equity)
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, 1 - p.equity / peak)
    if (prev > 0) returns.push(p.equity / prev - 1)
    prev = p.equity
  }

  let sharpe = 0
  if (returns.length > 1 && years > 0) {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1)
    const periodsPerYear = (n - 1) / years
    sharpe = variance > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(periodsPerYear) : 0
  }

  const wins = trades.filter((t) => t.pnl > 0)
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0)
  const grossLoss = trades.filter((t) => t.pnl < 0).reduce((a, t) => a - t.pnl, 0)

  return {
    totalReturn,
    benchmarkReturn,
    cagr,
    maxDrawdown,
    sharpe,
    winRate: trades.length ? wins.length / trades.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    trades: trades.length,
    avgTradeReturn: trades.length
      ? trades.reduce((a, t) => a + t.returnPct, 0) / trades.length
      : 0,
    exposure: n ? barsInMarket / n : 0,
    finalEquity,
  }
}
