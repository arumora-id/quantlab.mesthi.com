/**
 * Kalman filter with a local linear trend model on log prices:
 *   state  = [level, slope],  level' = level + slope + w1,  slope' = slope + w2,  observed = level + v.
 * The measurement noise R is the variance of one-bar log returns seen so far (no look-ahead); the
 * process noise is R / smooth for the level and that times `slopeRatio` for the slope. A larger
 * `smooth` gives a slower, smoother line.
 * Returns the filtered price (exp of the level) and the slope as percent per bar.
 */
export function kalmanTrend(closes: number[], smooth: number, slopeRatio: number) {
  const n = closes.length
  const value = new Array<number>(n).fill(NaN)
  const slope = new Array<number>(n).fill(NaN)
  if (!n) return { value, slope }
  let level = Math.log(closes[0])
  let trend = 0
  // covariance P = [[p00, p01], [p01, p11]]
  let p00 = 1
  let p01 = 0
  let p11 = 1
  let sum = 0
  let sumSq = 0
  let count = 0
  value[0] = closes[0]
  slope[0] = 0
  for (let i = 1; i < n; i++) {
    const z = Math.log(closes[i])
    const r = z - Math.log(closes[i - 1])
    sum += r
    sumSq += r * r
    count++
    const mean = sum / count
    const R = Math.max(count > 1 ? (sumSq - count * mean * mean) / (count - 1) : r * r, 1e-10)
    const qLevel = R / smooth
    const qSlope = qLevel * slopeRatio
    // predict
    level += trend
    const a00 = p00 + 2 * p01 + p11 + qLevel
    const a01 = p01 + p11
    const a11 = p11 + qSlope
    // update with the observation
    const s = a00 + R
    const k0 = a00 / s
    const k1 = a01 / s
    const innovation = z - level
    level += k0 * innovation
    trend += k1 * innovation
    p00 = (1 - k0) * a00
    p01 = (1 - k0) * a01
    p11 = a11 - k1 * a01
    value[i] = Math.exp(level)
    slope[i] = trend * 100
  }
  return { value, slope }
}
