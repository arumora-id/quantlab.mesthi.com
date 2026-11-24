import { computeMetrics } from './metrics'
import type {
  BacktestConfig,
  BacktestResult,
  Candle,
  EquityPoint,
  ExitReason,
  Position,
  Strategy,
  StrategyParams,
  Trade,
} from './types'

interface OpenPosition {
  side: 1 | -1
  entryIndex: number
  entryPrice: number
  /** Equity committed after the entry fee. */
  margin: number
  /** Equity before the entry fee, for trade PnL. */
  invested: number
}

/**
 * Bar-by-bar simulation without look-ahead:
 * a target decided on bar i's close is filled at bar i+1's open.
 * Stops, targets and liquidation are checked intrabar against high/low;
 * adverse exits are assumed to happen before the take-profit.
 *
 * Signals are computed on all candles (so indicators are warmed up), but trading and
 * metrics start flat at `startIndex`, e.g. for an out-of-sample window.
 */
export function runBacktest(
  allCandles: Candle[],
  strategy: Strategy,
  params: StrategyParams,
  config: BacktestConfig,
  startIndex = 0,
): BacktestResult {
  const fee = config.feeBps / 10_000
  const slip = config.slippageBps / 10_000
  const lev = Math.max(1, config.leverage)
  const candles = allCandles.slice(startIndex)
  const targets = strategy
    .targets(allCandles, params)
    .slice(startIndex)
    .map((t) => (t === -1 && !config.allowShort ? 0 : t)) as Position[]

  const trades: Trade[] = []
  const equity: EquityPoint[] = []
  let cash = config.initialCapital
  // assigned inside closures too, so widen explicitly to stop control-flow narrowing
  let pos = null as OpenPosition | null
  let pending: Position | null = null
  /** After a stop/target exit, wait for the signal to change before re-entering that side. */
  let blockedSide = 0 as Position
  let wiped = false
  let barsInMarket = 0

  const valueAt = (p: OpenPosition, price: number) =>
    Math.max(0, p.margin * (1 + p.side * lev * (price / p.entryPrice - 1)))

  const close = (i: number, rawPrice: number, reason: ExitReason) => {
    const p = pos!
    let exitPrice = rawPrice
    let net = 0
    if (reason !== 'liquidation') {
      exitPrice = rawPrice * (1 - p.side * slip)
      const gross = valueAt(p, exitPrice)
      const notional = p.margin * lev * (exitPrice / p.entryPrice)
      net = Math.max(0, gross - notional * fee)
    }
    const invested = p.invested
    trades.push({
      side: p.side,
      entryTime: candles[p.entryIndex].time,
      entryPrice: p.entryPrice,
      exitTime: candles[i].time,
      exitPrice,
      pnl: net - invested,
      returnPct: net / invested - 1,
      bars: i - p.entryIndex + 1,
      exitReason: reason,
    })
    cash = net
    pos = null
    if (cash <= 0) wiped = true
  }

  const open = (i: number, side: 1 | -1) => {
    const entryPrice = candles[i].open * (1 + side * slip)
    pos = { side, entryIndex: i, entryPrice, margin: cash * Math.max(0, 1 - lev * fee), invested: cash }
    cash = 0
  }

  for (let i = 0; i < candles.length; i++) {
    const bar = candles[i]

    if (!wiped && pending !== null) {
      const current: Position = pos ? pos.side : 0
      if (pending !== current) {
        if (pos) close(i, bar.open, 'signal')
        if (pending !== 0 && !wiped) open(i, pending)
      }
      pending = null
    }

    if (pos) checkIntrabar(i, bar)

    if (pos) barsInMarket++
    equity.push({
      time: bar.time,
      equity: pos ? valueAt(pos, bar.close) : cash,
      benchmark: (config.initialCapital * bar.close) / candles[0].close,
    })

    const target = targets[i] ?? 0
    if (target !== blockedSide) blockedSide = 0
    pending = target !== 0 && target === blockedSide ? 0 : target
  }

  const last = candles.length - 1
  if (pos) {
    close(last, candles[last].close, 'end')
    equity[last].equity = cash
  }

  return {
    trades,
    equity,
    metrics: computeMetrics(equity, trades, barsInMarket, config.initialCapital),
  }

  function checkIntrabar(i: number, bar: Candle) {
    const p = pos!
    const worst = p.side === 1 ? bar.low : bar.high
    const best = p.side === 1 ? bar.high : bar.low
    const crossedAdverse = (level: number) => (p.side === 1 ? worst <= level : worst >= level)
    const crossedFavourable = (level: number) => (p.side === 1 ? best >= level : best <= level)
    // the adverse level nearest to the entry is reached first
    const nearer = (a: number, b: number) => (p.side === 1 ? Math.max(a, b) : Math.min(a, b))
    const gapFill = (level: number) =>
      p.side === 1 ? Math.min(bar.open, level) : Math.max(bar.open, level)

    const liq = lev > 1 || p.side === -1 ? p.entryPrice * (1 - p.side / lev) : NaN
    const stop =
      config.stopLossPct > 0 ? p.entryPrice * (1 - (p.side * config.stopLossPct) / 100) : NaN

    const stopHit = !Number.isNaN(stop) && crossedAdverse(stop)
    const liqHit = !Number.isNaN(liq) && crossedAdverse(liq)
    if (liqHit && (!stopHit || nearer(stop, liq) === liq)) {
      close(i, liq, 'liquidation')
      return
    }
    if (stopHit) {
      close(i, gapFill(stop), 'stop')
      blockedSide = p.side
      return
    }
    if (config.takeProfitPct > 0) {
      const target = p.entryPrice * (1 + (p.side * config.takeProfitPct) / 100)
      if (crossedFavourable(target)) {
        const fill = p.side === 1 ? Math.max(bar.open, target) : Math.min(bar.open, target)
        close(i, fill, 'target')
        blockedSide = p.side
      }
    }
  }
}
