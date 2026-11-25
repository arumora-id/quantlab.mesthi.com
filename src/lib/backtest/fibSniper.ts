import { ema } from './indicators'
import { pivotConfirmed } from './pivots'
import { runPlannedTrades, type CostConfig, type PlannedTrade } from './plannedTrades'
import { htfContext, TIMEFRAMES, type HtfContext, type HtfData } from './timeframe'
import type { BacktestResult, Candle } from './types'

/**
 * "Fib Sniper" — a working version of the idea behind the user's Pine script "MTF Fibonacci Sniper with
 * FVG & OB" (the original never detects a CHoCH; see the PR notes). QuantLab's own definitions:
 *
 * 1. Swings are pivots with `swing` bars on each side, usable only once confirmed.
 * 2. CHoCH up: a close above the latest unbroken swing high while the structure was bearish or unknown.
 *    The impulse leg runs from the latest swing low (origin) to the highest high since then (extreme).
 *    With `requireFvg`, the leg must contain a bullish fair value gap (low > high two bars earlier).
 * 3. Optional 1-hour trend filter: the last closed 1h candle must be above its EMA (`htfEma`, 0 = off).
 * 4. Entry: within `wait` bars, the first candle that trades into the 0.5–0.618 retracement zone and closes
 *    bullish at or above the 0.618 level; filled at the next open. Until then the extreme keeps updating.
 *    The setup is cancelled when a close falls below the origin, or when it expires.
 * 5. Stop one tick beyond the origin; target at the `targetExt` Fibonacci extension beyond the extreme.
 * 6. Risk `riskPct` of equity per trade (capped at `maxWeight` x equity). Shorts mirror everything.
 */
export interface FibSniperParams {
  swing: number
  fibLow: number
  fibHigh: number
  targetExt: number
  wait: number
  requireFvg: number
  htfEma: number
  riskPct: number
  maxWeight: number
  tickBps: number
}

interface Swing {
  price: number
  index: number
  broken: boolean
}

interface Pending {
  side: 1 | -1
  origin: number
  extreme: number
  until: number
  hasFvg: boolean
}

export function fibSniperPlans(c: Candle[], p: FibSniperParams, ctx: HtfContext = htfContext(c)): PlannedTrade[] {
  const h1 = ctx.htf(TIMEFRAMES['1h'])
  const e = p.htfEma > 0 ? ema(h1.bars.map((b) => b.close), p.htfEma) : null
  const biasOk = (side: 1 | -1, i: number) => {
    if (!e) return true
    const v = h1.visible[i]
    return v >= 0 && !Number.isNaN(e[v]) && Math.sign(h1.bars[v].close - e[v]) === side
  }
  const fvgAt = (m: number, side: 1 | -1) =>
    m >= 2 && (side === 1 ? c[m].low > c[m - 2].high : c[m].high < c[m - 2].low)

  const plans: PlannedTrade[] = []
  const k = p.swing
  let hi: Swing | null = null
  let lo: Swing | null = null
  let trend = 0
  let setup: Pending | null = null

  for (let i = 0; i < c.length; i++) {
    const bar = c[i]
    const j = i - k
    if (j >= k) {
      if (pivotConfirmed(c, j, k, 'high')) hi = { price: c[j].high, index: j, broken: false }
      if (pivotConfirmed(c, j, k, 'low')) lo = { price: c[j].low, index: j, broken: false }
    }

    // 1) a pending setup: invalidation, expiry, entry, or a new extreme
    if (setup) {
      const s = setup
      const leg = Math.abs(s.extreme - s.origin)
      const near = s.extreme - s.side * p.fibLow * leg
      const far = s.extreme - s.side * p.fibHigh * leg
      const invalid = s.side === 1 ? bar.close < s.origin : bar.close > s.origin
      if (invalid || i > s.until) setup = null
      else {
        const touched = s.side === 1 ? bar.low <= near : bar.high >= near
        const rejected = s.side === 1 ? bar.close >= far && bar.close > bar.open : bar.close <= far && bar.close < bar.open
        if (touched && rejected && (!p.requireFvg || s.hasFvg)) {
          if (i + 1 < c.length) {
            const tick = (bar.close * p.tickBps) / 10_000
            plans.push({
              side: s.side,
              entryIndex: i + 1,
              stop: s.origin - s.side * tick,
              target: s.extreme + s.side * p.targetExt * leg,
            })
          }
          setup = null
        } else {
          const ext = s.side === 1 ? bar.high : bar.low
          if (s.side === 1 ? ext > s.extreme : ext < s.extreme) s.extreme = ext
          if (fvgAt(i, s.side)) s.hasFvg = true
        }
      }
    }

    // 2) structure breaks; a break against the structure is a CHoCH and starts a setup
    const startSetup = (side: 1 | -1, origin: Swing): Pending => {
      let extreme = side === 1 ? -Infinity : Infinity
      let hasFvg = false
      for (let m = origin.index; m <= i; m++) {
        extreme = side === 1 ? Math.max(extreme, c[m].high) : Math.min(extreme, c[m].low)
        if (m >= origin.index + 2 && fvgAt(m, side)) hasFvg = true
      }
      return { side, origin: origin.price, extreme, until: i + p.wait, hasFvg }
    }
    if (hi && !hi.broken && bar.close > hi.price) {
      hi.broken = true
      if (trend !== 1 && lo && lo.index < i && biasOk(1, i)) setup = startSetup(1, lo)
      trend = 1
    } else if (lo && !lo.broken && bar.close < lo.price) {
      lo.broken = true
      if (trend !== -1 && hi && hi.index < i && biasOk(-1, i)) setup = startSetup(-1, hi)
      trend = -1
    }
  }
  return plans
}

export function runFibSniperBacktest(
  all: Candle[],
  p: FibSniperParams,
  cost: CostConfig,
  startIndex = 0,
  htf?: HtfData,
): BacktestResult {
  return runPlannedTrades(all, fibSniperPlans(all, p, htfContext(all, htf)), p, cost, startIndex)
}
