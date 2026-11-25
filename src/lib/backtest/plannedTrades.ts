import { computeMetrics } from './metrics'
import type { BacktestResult, Candle, EquityPoint, Trade } from './types'

/** An order decided on a closed candle: filled at `entryIndex`'s open with its own stop and target. */
export interface PlannedTrade {
  side: 1 | -1
  /** Bar whose open fills the order. */
  entryIndex: number
  stop: number
  target: number
}

export interface CostConfig {
  initialCapital: number
  feeBps: number
  slippageBps: number
}

export interface PlanSizing {
  /** Equity at risk per trade, in percent, including costs to the stop. */
  riskPct: number
  /** Cap on notional as a multiple of equity. */
  maxWeight: number
}

/**
 * Runs planned trades: one position at a time (plans arriving while one is open are skipped), plans with the
 * stop or target on the wrong side of the fill or a target that does not cover costs are skipped, the stop is
 * checked before the target inside a candle, a gapped stop fills at the open, and `forceExit` closes at that close.
 */
export function runPlannedTrades(
  all: Candle[],
  allPlans: PlannedTrade[],
  p: PlanSizing,
  cost: CostConfig,
  startIndex = 0,
  forceExit?: boolean[],
): BacktestResult {
  const plans = allPlans.filter((x) => x.entryIndex >= startIndex)
  const fee = cost.feeBps / 10_000
  const slip = cost.slippageBps / 10_000
  const trades: Trade[] = []
  const equity: EquityPoint[] = []
  let cash = cost.initialCapital
  let barsInMarket = 0
  let pos: { side: 1 | -1; units: number; fill: number; stop: number; target: number; index: number; eq: number } | null = null
  let next = 0

  const exit = (i: number, raw: number, reason: Trade['exitReason']) => {
    const q = pos!
    const px = raw * (1 - q.side * slip)
    const pnl = q.side * q.units * (px - q.fill) - q.units * px * fee
    cash += pnl
    trades.push({
      side: q.side,
      entryTime: all[q.index].time,
      entryPrice: q.fill,
      exitTime: all[i].time,
      exitPrice: px,
      pnl: cash - q.eq,
      returnPct: cash / q.eq - 1,
      bars: i - q.index + 1,
      exitReason: reason,
    })
    pos = null
  }

  for (let i = startIndex; i < all.length; i++) {
    const bar = all[i]
    while (next < plans.length && plans[next].entryIndex < i) next++ // missed while a position was open
    if (!pos && next < plans.length && plans[next].entryIndex === i) {
      const plan = plans[next++]
      const fill = bar.open * (1 + plan.side * slip)
      const roundTrip = 2 * (fee + slip)
      const rightSide = plan.side === 1 ? plan.stop < fill && fill < plan.target : plan.stop > fill && fill > plan.target
      if (rightSide && Math.abs(plan.target - fill) / fill > roundTrip && cash > 0) {
        const perUnitLoss = Math.abs(fill - plan.stop) + (fill + plan.stop) * fee + plan.stop * slip
        const units = Math.min((cash * p.riskPct) / 100 / perUnitLoss, (p.maxWeight * cash) / fill)
        const eq = cash
        cash -= units * fill * fee
        pos = { side: plan.side, units, fill, stop: plan.stop, target: plan.target, index: i, eq }
      }
    }
    if (pos) {
      const q = pos
      const stopHit = q.side === 1 ? bar.low <= q.stop : bar.high >= q.stop
      const targetHit = q.side === 1 ? bar.high >= q.target : bar.low <= q.target
      if (stopHit) exit(i, q.side === 1 ? Math.min(bar.open, q.stop) : Math.max(bar.open, q.stop), 'stop')
      else if (targetHit) exit(i, q.target, 'target')
      else if (forceExit?.[i]) exit(i, bar.close, 'session')
    }
    if (pos) barsInMarket++
    const open = pos as typeof pos
    equity.push({
      time: bar.time,
      equity: cash + (open ? open.side * open.units * (bar.close - open.fill) : 0),
      benchmark: (cost.initialCapital * bar.close) / all[startIndex].close,
    })
  }
  if (pos) exit(all.length - 1, all[all.length - 1].close, 'end')
  if (equity.length) equity[equity.length - 1].equity = cash
  return { trades, equity, metrics: computeMetrics(equity, trades, barsInMarket, cost.initialCapital) }
}
