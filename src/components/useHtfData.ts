import { useEffect, useMemo, useState } from 'react'
import { fetchFuturesKlines } from '../lib/backtest/binanceFutures'
import { neededTimeframes, type Setup } from '../lib/backtest/rules'
import { baseSeconds, tfName, type HtfData } from '../lib/backtest/timeframe'
import type { Candle } from '../lib/backtest/types'

const EMPTY: HtfData = {}
/** Extra higher-timeframe candles before the chart starts, for warm-ups such as a 4H EMA 200. */
const WARMUP = 400
const MAX_HTF_BARS = 5000

/**
 * Loads the higher-timeframe candles the given setups read (e.g. 4H and 15M for a 1M chart),
 * covering the chart plus a warm-up. Until they arrive, indicators fall back to resampling the chart.
 */
export function useHtfData(symbol: string | null, candles: Candle[], setups: Setup[]): HtfData {
  const [state, setState] = useState<{ key: string; htf: HtfData }>({ key: '', htf: EMPTY })
  const base = candles.length > 1 ? baseSeconds(candles) : 0
  const neededKey = useMemo(() => (base ? neededTimeframes(setups, base).join(',') : ''), [setups, base])
  const first = candles[0]?.time ?? 0
  const last = candles[candles.length - 1]?.time ?? 0
  const key = `${symbol}|${first}|${last}`

  useEffect(() => {
    if (!symbol || !neededKey) return
    const ctrl = new AbortController()
    const tfs = neededKey.split(',').map(Number)
    Promise.all(
      tfs.map(async (tf) => {
        const name = tfName(tf)
        if (!name) return null
        const bars = Math.min(MAX_HTF_BARS, Math.ceil((last - first) / tf) + WARMUP)
        try {
          return [tf, await fetchFuturesKlines(symbol, name, bars, ctrl.signal)] as const
        } catch {
          return null // keep the resampled fallback
        }
      }),
    ).then((results) => {
      if (ctrl.signal.aborted) return
      setState((prev) => {
        const htf: HtfData = { ...(prev.key === key ? prev.htf : {}) }
        for (const r of results) if (r) htf[r[0]] = r[1]
        return { key, htf }
      })
    })
    return () => ctrl.abort()
  }, [symbol, key, neededKey, first, last])

  return state.key === key ? state.htf : EMPTY
}
