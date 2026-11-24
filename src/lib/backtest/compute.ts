import { computeIndicators, type SeriesMap, type Setup } from './rules'
import { runSetup } from './runSetup'
import type { HtfData } from './timeframe'
import type { BacktestConfig, BacktestResult, Candle, Metrics } from './types'

/** Everything one backtest view needs; plain data so it can cross to a Web Worker. */
export interface RunRequest {
  candles: Candle[]
  setup: Setup
  config: BacktestConfig
  oosStart: number | null
  htf: HtfData
}

export interface RunResult {
  series: SeriesMap
  result: BacktestResult
  oos: Metrics | null
}

export function computeRun({ candles, setup, config, oosStart, htf }: RunRequest): RunResult {
  return {
    series: computeIndicators(candles, setup.indicators, htf),
    result: runSetup(candles, setup, config, 0, htf),
    oos: oosStart !== null ? runSetup(candles, setup, config, oosStart, htf).metrics : null,
  }
}

export interface CompareRequest {
  candles: Candle[]
  setups: { setup: Setup; source: 'preset' | 'saved' }[]
  config: BacktestConfig
  oosStart: number | null
  htf: HtfData
}

export interface CompareRow {
  setup: Setup
  source: 'preset' | 'saved'
  full: Metrics
  oos: Metrics | null
}

/** Runs every setup; `onProgress(done, total)` after each one. */
export function computeCompare(r: CompareRequest, onProgress?: (done: number, total: number) => void): CompareRow[] {
  return r.setups.map(({ setup, source }, i) => {
    const row = {
      setup,
      source,
      full: runSetup(r.candles, setup, r.config, 0, r.htf).metrics,
      oos: r.oosStart !== null ? runSetup(r.candles, setup, r.config, r.oosStart, r.htf).metrics : null,
    }
    onProgress?.(i + 1, r.setups.length)
    return row
  })
}
