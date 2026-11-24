import { computeMetrics } from './metrics'
import type { BacktestResult, Candle, EquityPoint, Trade } from './types'

export interface ExposureConfig {
  initialCapital: number
  feeBps: number
  slippageBps: number
  /** Skip rebalances smaller than this change in weight (saves fees); entries and exits always trade. */
  rebalanceBand: number
}

/**
 * Simulates a target weight per bar (1 = 100% of equity long, 0.5 = half, 0 = cash, negative = short).
 * The weight decided at bar i's close is traded at bar i+1's open; costs apply to the traded amount.
 * A "trade" is one stretch of non-zero exposure on the same side.
 */
export function runExposureBacktest(
  allCandles: Candle[],
  allWeights: number[],
  cfg: ExposureConfig,
  startIndex = 0,
): BacktestResult {
  const candles = allCandles.slice(startIndex)
  const weights = allWeights.slice(startIndex)
  const fee = cfg.feeBps / 10_000
  const slip = cfg.slippageBps / 10_000
  let cash = cfg.initialCapital
  let units = 0
  let weight = 0
  let pending: number | null = null
  let wiped = false
  let barsInMarket = 0
  const equity: EquityPoint[] = []
  const trades: Trade[] = []
  let open: { side: 1 | -1; index: number; price: number; equity: number } | null = null

  const value = (price: number) => cash + units * price
  const closeTrade = (i: number, price: number, reason: Trade['exitReason']) => {
    if (!open) return
    const eq = value(price)
    trades.push({
      side: open.side,
      entryTime: candles[open.index].time,
      entryPrice: open.price,
      exitTime: candles[i].time,
      exitPrice: price,
      pnl: eq - open.equity,
      returnPct: eq / open.equity - 1,
      bars: i - open.index + 1,
      exitReason: reason,
    })
    open = null
  }

  for (let i = 0; i < candles.length; i++) {
    const bar = candles[i]
    if (!wiped && pending !== null) {
      const target = pending
      const sideChange = Math.sign(target) !== Math.sign(weight)
      if (sideChange || Math.abs(target - weight) > cfg.rebalanceBand) {
        const eqOpen = value(bar.open)
        const targetUnits = (target * eqOpen) / bar.open
        const delta = targetUnits - units
        const fill = bar.open * (1 + Math.sign(delta) * slip)
        if (open && sideChange) closeTrade(i, bar.open, 'signal')
        const before = value(bar.open)
        cash -= delta * fill + Math.abs(delta) * fill * fee
        units = targetUnits
        weight = target
        if (target !== 0 && !open) open = { side: target > 0 ? 1 : -1, index: i, price: fill, equity: before }
      }
      pending = null
    }
    let eq = value(bar.close)
    if (eq <= 0 && !wiped) {
      wiped = true
      closeTrade(i, bar.close, 'liquidation')
      cash = 0
      units = 0
      weight = 0
      eq = 0
    }
    if (units !== 0) barsInMarket++
    equity.push({ time: bar.time, equity: eq, benchmark: (cfg.initialCapital * bar.close) / candles[0].close })
    pending = Number.isFinite(weights[i]) ? weights[i] : 0
  }
  const last = candles.length - 1
  if (open && last >= 0) closeTrade(last, candles[last].close, 'end')

  return { trades, equity, metrics: computeMetrics(equity, trades, barsInMarket, cfg.initialCapital) }
}
