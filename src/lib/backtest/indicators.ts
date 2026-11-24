/**
 * Indicator math primitives. Every function returns an array aligned with its input;
 * warm-up values are NaN. Leading NaNs in the input are skipped, so primitives chain
 * (e.g. an EMA of a MACD line).
 */

type Series = number[]

const nanArray = (n: number) => new Array<number>(n).fill(NaN)

/** Runs `fn` on the input after its leading NaNs and pads the result back. */
function afterWarmup(values: Series, fn: (v: Series) => Series): Series {
  const start = values.findIndex((v) => !Number.isNaN(v))
  if (start < 0) return nanArray(values.length)
  return [...nanArray(start), ...fn(values.slice(start))]
}

export function sma(values: Series, period: number): Series {
  return afterWarmup(values, (v) => {
    const out = nanArray(v.length)
    let sum = 0
    for (let i = 0; i < v.length; i++) {
      sum += v[i]
      if (i >= period) sum -= v[i - period]
      if (i >= period - 1) out[i] = sum / period
    }
    return out
  })
}

/** Exponential smoothing seeded with the SMA of the first `period` values. */
function smooth(values: Series, period: number, alpha: number): Series {
  return afterWarmup(values, (v) => {
    const out = nanArray(v.length)
    if (v.length < period) return out
    let prev = v.slice(0, period).reduce((a, b) => a + b, 0) / period
    out[period - 1] = prev
    for (let i = period; i < v.length; i++) {
      prev = v[i] * alpha + prev * (1 - alpha)
      out[i] = prev
    }
    return out
  })
}

export const ema = (values: Series, period: number) => smooth(values, period, 2 / (period + 1))
/** Wilder's moving average (RMA). */
export const rma = (values: Series, period: number) => smooth(values, period, 1 / period)

export function wma(values: Series, period: number): Series {
  return afterWarmup(values, (v) => {
    const out = nanArray(v.length)
    const denom = (period * (period + 1)) / 2
    for (let i = period - 1; i < v.length; i++) {
      let s = 0
      for (let j = 0; j < period; j++) s += v[i - j] * (period - j)
      out[i] = s / denom
    }
    return out
  })
}

export function stdev(values: Series, period: number): Series {
  const mean = sma(values, period)
  return values.map((_, i) => {
    if (Number.isNaN(mean[i])) return NaN
    let sq = 0
    for (let j = i - period + 1; j <= i; j++) sq += (values[j] - mean[i]) ** 2
    return Math.sqrt(sq / period)
  })
}

export function highest(values: Series, period: number): Series {
  return values.map((_, i) => (i < period - 1 ? NaN : Math.max(...values.slice(i - period + 1, i + 1))))
}

export function lowest(values: Series, period: number): Series {
  return values.map((_, i) => (i < period - 1 ? NaN : Math.min(...values.slice(i - period + 1, i + 1))))
}

export function sum(values: Series, period: number): Series {
  return sma(values, period).map((v) => v * period)
}

/** Value `n` bars ago. */
export function shift(values: Series, n: number): Series {
  return values.map((_, i) => (i - n >= 0 ? values[i - n] : NaN))
}

/** RSI with Wilder's smoothing. */
export function rsi(values: Series, period: number): Series {
  return afterWarmup(values, (v) => {
    const out = nanArray(v.length)
    if (v.length <= period) return out
    let gain = 0
    let loss = 0
    for (let i = 1; i <= period; i++) {
      const d = v[i] - v[i - 1]
      if (d > 0) gain += d
      else loss -= d
    }
    gain /= period
    loss /= period
    const value = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss))
    out[period] = value()
    for (let i = period + 1; i < v.length; i++) {
      const d = v[i] - v[i - 1]
      gain = (gain * (period - 1) + Math.max(d, 0)) / period
      loss = (loss * (period - 1) + Math.max(-d, 0)) / period
      out[i] = value()
    }
    return out
  })
}

/** Bollinger Bands using the population standard deviation. */
export function bollinger(values: Series, period: number, k: number) {
  const middle = sma(values, period)
  const sd = stdev(values, period)
  return {
    middle,
    upper: middle.map((m, i) => m + k * sd[i]),
    lower: middle.map((m, i) => m - k * sd[i]),
  }
}
