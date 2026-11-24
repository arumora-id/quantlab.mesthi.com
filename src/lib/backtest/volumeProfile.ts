import type { Candle } from './types'

export interface VolumeProfile {
  low: number
  binSize: number
  volumes: number[]
  /** Middle of the busiest bin. */
  poc: number
  /** Value area (70% of volume) edges. */
  val: number
  vah: number
  /** Interior bins with less volume than both neighbours. */
  lvnBins: number[]
}

export const binRange = (p: VolumeProfile, bin: number): [number, number] => [
  p.low + bin * p.binSize,
  p.low + (bin + 1) * p.binSize,
]

/**
 * Estimated volume-at-price from candles: equal-width bins from the lowest low to the highest high;
 * each candle's volume is spread over the bins its range overlaps, in proportion to the overlap
 * (a flat candle puts all its volume in its price's bin). This is an estimate: candles do not say
 * where inside their range the volume traded.
 */
export function volumeProfile(candles: Candle[], bins = 32): VolumeProfile | null {
  if (!candles.length) return null
  let low = Infinity
  let high = -Infinity
  for (const c of candles) {
    low = Math.min(low, c.low)
    high = Math.max(high, c.high)
  }
  if (!(high > low)) return null
  const binSize = (high - low) / bins
  const volumes = new Array<number>(bins).fill(0)
  const binOf = (price: number) => Math.min(bins - 1, Math.max(0, Math.floor((price - low) / binSize)))
  for (const c of candles) {
    if (!(c.volume > 0)) continue
    if (c.high === c.low) {
      volumes[binOf(c.low)] += c.volume
      continue
    }
    for (let b = binOf(c.low); b <= binOf(c.high); b++) {
      const overlap = Math.min(c.high, low + (b + 1) * binSize) - Math.max(c.low, low + b * binSize)
      if (overlap > 0) volumes[b] += (c.volume * overlap) / (c.high - c.low)
    }
  }
  // POC: the busiest bin; ties go to the lower price
  let pocBin = 0
  for (let b = 1; b < bins; b++) if (volumes[b] > volumes[pocBin]) pocBin = b
  // value area: grow from the POC towards the busier neighbour until 70%; ties go to the lower price
  const total = volumes.reduce((a, v) => a + v, 0)
  let lo = pocBin
  let hi = pocBin
  let acc = volumes[pocBin]
  while (acc < 0.7 * total) {
    const down = lo > 0 ? volumes[lo - 1] : -1
    const up = hi < bins - 1 ? volumes[hi + 1] : -1
    if (down < 0 && up < 0) break
    if (down >= up) acc += volumes[--lo]
    else acc += volumes[++hi]
  }
  const lvnBins: number[] = []
  for (let b = 1; b < bins - 1; b++) if (volumes[b] < volumes[b - 1] && volumes[b] < volumes[b + 1]) lvnBins.push(b)
  return {
    low,
    binSize,
    volumes,
    poc: low + (pocBin + 0.5) * binSize,
    val: low + lo * binSize,
    vah: low + (hi + 1) * binSize,
    lvnBins,
  }
}
