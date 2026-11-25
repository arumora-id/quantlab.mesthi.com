import { runPlannedTrades, type CostConfig, type PlannedTrade } from './plannedTrades'
import { LONDON_OPEN, NEW_YORK_OPEN, sessionMask } from './sessions'
import { baseSeconds } from './timeframe'
import type { BacktestResult, Candle } from './types'

export type { CostConfig } from './plannedTrades'
import { binRange, volumeProfile, type VolumeProfile } from './volumeProfile'

/**
 * "Inspired by Fabio Valentini · 1m volume-profile and delta proxy" — the experiment specification
 * prepared by the Methoda research agent from Fabio's public demonstrations and an attributed playbook.
 * It is a proxy: candles cannot show footprint, absorption, trade size or the order inside a bar, so the
 * volume-at-price and the "aggression" here are estimates (profile bins, taker delta per 1m candle).
 *
 * Trend mode (New York 09:30-11:30): after a close inside yesterday's UTC value area, two closes in a row
 * beyond it confirm a breakout; the impulse profile gives the LVN to wait for and the nearest POC of the
 * previous five UTC days ahead is the target. Reversion mode (London 08:00-10:00): a close outside the
 * value area followed by the first close back inside; the excursion profile gives the LVN, yesterday's
 * POC is the target. Both: within the next `watch` bars, the first candle touching the LVN bin must close
 * beyond it with delta/volume of at least `deltaMin` in the trade's direction; entry at the next open,
 * stop one tick beyond the trigger candle, full exit at target, stop, or the end of the window.
 * Each trade risks `riskPct` of equity including costs, capped at `maxWeight` x equity notional.
 */
export interface FabioParams {
  mode: 'trend' | 'reversion'
  bins: number
  watch: number
  deltaMin: number
  riskPct: number
  maxWeight: number
  /** Tick used for the stop buffer, in basis points of price (an assumption: real tick sizes vary by symbol). */
  tickBps: number
}

interface Setup {
  side: 1 | -1
  lvn: [number, number]
  until: number
  target: number
}


const DAY = 86_400

/** Finds trigger candles and the resulting order plans; decisions use closed candles only. */
export function fabioPlans(c: Candle[], p: FabioParams): PlannedTrade[] {
  const step = baseSeconds(c)
  const times = c.map((x) => x.time)
  const { inside: inWindow, last: windowEnd } = sessionMask(times, step, p.mode === 'trend' ? NEW_YORK_OPEN : LONDON_OPEN)

  // complete UTC-day profiles, computed lazily
  const dayBars = new Map<number, Candle[]>()
  for (const x of c) {
    const d = Math.floor(x.time / DAY)
    if (!dayBars.has(d)) dayBars.set(d, [])
    dayBars.get(d)!.push(x)
  }
  const profiles = new Map<number, VolumeProfile | null>()
  const dayProfile = (d: number) => {
    if (!profiles.has(d)) {
      const bars = dayBars.get(d)
      const complete = !!bars && bars[0].time === d * DAY && bars[bars.length - 1].time + step >= (d + 1) * DAY
      profiles.set(d, complete ? volumeProfile(bars!, p.bins) : null)
    }
    return profiles.get(d)!
  }

  const plans: PlannedTrade[] = []
  let lastInside = -1
  let excursion: { side: 1 | -1; extremeIdx: number } | null = null
  let armed: Setup | null = null

  for (let i = 0; i < c.length; i++) {
    const bar = c[i]
    const day = Math.floor(bar.time / DAY)
    const ref = dayProfile(day - 1)
    if (!ref || !inWindow[i]) {
      armed = null
      excursion = null
      lastInside = -1
      continue
    }
    const isInside = bar.close >= ref.val && bar.close <= ref.vah

    // 1) a watched LVN: the first touch decides
    if (armed) {
      const [lo, hi] = armed.lvn
      if (i > armed.until) armed = null
      else if (bar.low <= hi && bar.high >= lo) {
        const d = bar.volume > 0 && bar.takerBuyVolume !== undefined ? (2 * bar.takerBuyVolume - bar.volume) / bar.volume : NaN
        const ok = armed.side === 1 ? bar.close > hi && d >= p.deltaMin : bar.close < lo && d <= -p.deltaMin
        if (ok && i + 1 < c.length && !windowEnd[i]) {
          const tick = (bar.close * p.tickBps) / 10_000
          plans.push({
            side: armed.side,
            entryIndex: i + 1,
            stop: armed.side === 1 ? bar.low - tick : bar.high + tick,
            target: armed.target,
          })
        }
        armed = null
      }
    }

    // 2) new setups (one attempt each); one-position-at-a-time is enforced by the simulator
    if (!armed) {
      if (p.mode === 'trend') {
        const prev = c[i - 1]
        const twoBeyond = (side: 1 | -1) =>
          lastInside === i - 2 && prev && (side === 1 ? prev.close > ref.vah && bar.close > ref.vah : prev.close < ref.val && bar.close < ref.val)
        for (const side of [1, -1] as const) {
          if (!twoBeyond(side)) continue
          const prof = volumeProfile(c.slice(lastInside, i + 1), p.bins)
          const lvn = prof && pickLvn(prof, bar.close, side)
          const pocs = [1, 2, 3, 4, 5].map((k) => dayProfile(day - k)?.poc).filter((x): x is number => x !== undefined)
          const ahead = pocs.filter((x) => (side === 1 ? x > bar.close : x < bar.close))
          const target = ahead.length ? (side === 1 ? Math.min(...ahead) : Math.max(...ahead)) : NaN
          if (lvn && Number.isFinite(target)) armed = { side, lvn, until: i + p.watch, target }
        }
      } else {
        if (isInside && excursion) {
          // first close back inside after an excursion: reclaim
          const prof = volumeProfile(c.slice(excursion.extremeIdx, i + 1), p.bins)
          const lvn = prof && pickLvn(prof, bar.close, excursion.side)
          if (lvn) armed = { side: excursion.side, lvn, until: i + p.watch, target: ref.poc }
          excursion = null
        } else if (!isInside && lastInside >= 0 && !excursion) {
          // long setups come from a dip below the value area, shorts from a pop above it
          excursion = { side: bar.close < ref.val ? 1 : -1, extremeIdx: i }
        } else if (excursion) {
          const ext = c[excursion.extremeIdx]
          if (excursion.side === 1 ? bar.low < ext.low : bar.high > ext.high) excursion.extremeIdx = i
        }
      }
    }
    if (isInside) lastInside = i
  }
  return plans
}

/** Long: highest LVN bin below the close; short: lowest LVN bin above it. */
function pickLvn(prof: VolumeProfile, close: number, side: 1 | -1): [number, number] | null {
  const ranges = prof.lvnBins.map((b) => binRange(prof, b))
  const candidates = ranges.filter(([lo, hi]) => (side === 1 ? hi < close : lo > close))
  if (!candidates.length) return null
  return side === 1 ? candidates[candidates.length - 1] : candidates[0]
}

/** Runs the plans: risk-sized, one position at a time, stop before target inside a candle, flat at the window's end. */
export function runFabioBacktest(all: Candle[], p: FabioParams, cost: CostConfig, startIndex = 0): BacktestResult {
  const { last: windowEnd } = sessionMask(
    all.map((x) => x.time),
    baseSeconds(all),
    p.mode === 'trend' ? NEW_YORK_OPEN : LONDON_OPEN,
  )
  return runPlannedTrades(all, fabioPlans(all, p), p, cost, startIndex, windowEnd)
}
