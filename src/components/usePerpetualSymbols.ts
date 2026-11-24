import { useEffect, useState } from 'react'
import { fetchUsdtPerpetuals } from '../lib/backtest/binanceFutures'

/** All tradable USDT-M perpetual symbols; null while loading, [] when the list could not be loaded. */
export function usePerpetualSymbols() {
  const [symbols, setSymbols] = useState<string[] | null>(null)
  useEffect(() => {
    const ctrl = new AbortController()
    fetchUsdtPerpetuals(ctrl.signal)
      .then(setSymbols)
      .catch(() => {
        if (!ctrl.signal.aborted) setSymbols([])
      })
    return () => ctrl.abort()
  }, [])
  return symbols
}
