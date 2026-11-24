import type { Candle } from './types'

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deterministic synthetic daily candles (random walk with drifting regimes).
 * Example data for offline use only: it is not market data.
 */
export function syntheticCandles(count: number, seed = 42, start = 30_000): Candle[] {
  const rand = mulberry32(seed)
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand())
  const t0 = Date.UTC(2021, 0, 1) / 1000
  const out: Candle[] = []
  let price = start
  let drift = 0
  for (let i = 0; i < count; i++) {
    if (i % 120 === 0) drift = (rand() - 0.5) * 0.006
    const open = price
    const close = open * Math.exp(drift + 0.03 * gauss())
    const high = Math.max(open, close) * (1 + Math.abs(gauss()) * 0.01)
    const low = Math.min(open, close) * (1 - Math.abs(gauss()) * 0.01)
    out.push({ time: t0 + i * 86_400, open, high, low, close, volume: 1000 + rand() * 1000 })
    price = close
  }
  return out
}
