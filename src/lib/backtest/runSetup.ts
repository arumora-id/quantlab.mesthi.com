import { runBacktest } from './engine'
import { runExposureBacktest } from './exposureEngine'
import { runFabioBacktest } from './fabioProxy'
import { setupToStrategy, type Setup } from './rules'
import { trendEnsembleWeights } from './trendEnsemble'
import type { HtfData } from './timeframe'
import type { BacktestConfig, BacktestResult, Candle } from './types'

/**
 * Runs any setup: rule setups use the full-position engine; sized models use the weight engine
 * (they set their own position size, so leverage, stop loss and take profit do not apply).
 */
export function runSetup(
  candles: Candle[],
  setup: Setup,
  config: BacktestConfig,
  startIndex = 0,
  htf?: HtfData,
): BacktestResult {
  if (setup.model?.kind === 'fabioProxy') {
    const { initialCapital, feeBps, slippageBps } = config
    return runFabioBacktest(candles, setup.model, { initialCapital, feeBps, slippageBps }, startIndex)
  }
  if (setup.model) {
    const weights = trendEnsembleWeights(candles, setup.model)
    return runExposureBacktest(
      candles,
      weights,
      {
        initialCapital: config.initialCapital,
        feeBps: config.feeBps,
        slippageBps: config.slippageBps,
        rebalanceBand: setup.model.rebalanceBand,
      },
      startIndex,
    )
  }
  return runBacktest(candles, setupToStrategy(setup, htf), {}, config, startIndex)
}
