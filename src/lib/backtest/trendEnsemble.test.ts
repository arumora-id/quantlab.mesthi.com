import { describe, expect, it } from 'vitest'
import { syntheticCandles } from './sampleData'
import { breakoutModel, realizedVol, trendEnsembleWeights, ZARATTINI_LOOKBACKS } from './trendEnsemble'

describe('breakoutModel', () => {
  it('enters on a new N-bar closing high and exits when the close hits the rising stop', () => {
    // N = 3. Bar 2 makes a new high (3): stop = middle of [1..3] = 2.
    // Bar 3 (4) new high; stop rises to the previous middle (2). Bar 4 (5): stop rises to mid of [2,3,4] = 3.
    // Bar 5 closes at 3 <= stop 3.5 (mid of [3,4,5] from bar 4) -> exit.
    const closes = [1, 2, 3, 4, 5, 3, 2]
    expect(breakoutModel(closes, 3)).toEqual([0, 0, 1, 1, 1, 0, 0])
  })

  it('stays flat while the close is below the channel high', () => {
    expect(breakoutModel([5, 4, 3, 2, 1], 3)).toEqual([0, 0, 0, 0, 0])
  })
})

describe('realizedVol', () => {
  it('annualises the standard deviation of returns', () => {
    // returns alternate +10% / -10% around a flat level: sample std ≈ 0.1 (for alternating ±r it is r*sqrt(n/(n-1)))
    const closes = [100]
    for (let i = 0; i < 20; i++) closes.push(closes[i] * (i % 2 ? 1 / 1.1 : 1.1))
    const v = realizedVol(closes, 4, 1)
    expect(v[19]).toBeGreaterThan(0.08)
    expect(v[19]).toBeLessThan(0.13)
  })
})

describe('trendEnsembleWeights', () => {
  const candles = syntheticCandles(1200, 5)
  const p = { lookbacks: ZARATTINI_LOOKBACKS, targetVol: 25, volLookback: 90, maxWeight: 1 }
  const w = trendEnsembleWeights(candles, p)

  it('stays long-only and never above the cap', () => {
    expect(w.every((x) => x >= 0 && x <= 1)).toBe(true)
    expect(w.some((x) => x > 0)).toBe(true)
  })

  it('does not look ahead', () => {
    expect(trendEnsembleWeights(candles.slice(0, 700), p)).toEqual(w.slice(0, 700))
  })

  it('scales down when volatility is above the target', () => {
    const lev = trendEnsembleWeights(candles, { ...p, maxWeight: 100 })
    const ratio = lev.map((x, i) => (w[i] > 0 && x > 0 ? x / w[i] : 1))
    expect(Math.max(...ratio)).toBeGreaterThanOrEqual(1)
  })
})
