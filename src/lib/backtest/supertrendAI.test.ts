import { describe, expect, it } from 'vitest'
import { syntheticCandles } from './sampleData'
import { kmeans3, supertrendAI } from './supertrendAI'

const params = { atrLength: 10, minFactor: 1, maxFactor: 5, step: 0.5, perfMemory: 10, cluster: 2, maxIter: 1000 }

describe('kmeans3', () => {
  it('separates three obvious groups', () => {
    const v = [1, 1.1, 0.9, 5, 5.2, 4.8, 9, 9.1, 8.9]
    expect(kmeans3(v, 100)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
    ])
  })
})

describe('supertrendAI', () => {
  const candles = syntheticCandles(800, 13)
  const out = supertrendAI(candles, params)

  it('picks a factor inside the configured range', () => {
    const f = out.factor.filter((x) => !Number.isNaN(x))
    expect(f.length).toBeGreaterThan(700)
    expect(f.every((x) => x >= 1 && x <= 5)).toBe(true)
  })

  it('trails below price when long and above when short', () => {
    out.signal.forEach((s, i) => {
      if (s === 1 && out.signal[i - 1] === 1) expect(out.stop[i]).toBeLessThanOrEqual(candles[i].close)
      if (s === -1 && out.signal[i - 1] === -1) expect(out.stop[i]).toBeGreaterThanOrEqual(candles[i].close)
    })
  })

  it('flips some times and does not look ahead', () => {
    const flips = out.signal.filter((s, i) => i > 0 && s !== 0 && s !== out.signal[i - 1]).length
    expect(flips).toBeGreaterThan(5)
    expect(supertrendAI(candles.slice(0, 500), params).signal).toEqual(out.signal.slice(0, 500))
  })
})
