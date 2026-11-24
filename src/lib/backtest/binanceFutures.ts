import type { Candle } from './types'

/** Binance USDⓈ-M Futures public market data (no API key, CORS enabled). */
const BASE = 'https://fapi.binance.com/fapi/v1'
const MAX_LIMIT = 1500

export const INTERVALS = ['1d', '12h', '8h', '4h', '1h', '15m'] as const
export type Interval = (typeof INTERVALS)[number]

type RawKline = [number, string, string, string, string, string, ...unknown[]]

/** Fetches up to `bars` closed candles, paging backwards from now. */
export async function fetchFuturesKlines(
  symbol: string,
  interval: Interval,
  bars: number,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const out: Candle[] = []
  let endTime: number | undefined
  while (out.length < bars) {
    const limit = Math.min(MAX_LIMIT, bars - out.length)
    const q = new URLSearchParams({ symbol: symbol.toUpperCase(), interval, limit: String(limit) })
    if (endTime !== undefined) q.set('endTime', String(endTime))
    const res = await fetch(`${BASE}/klines?${q}`, { signal })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.msg ?? `Binance Futures error ${res.status}`)
    }
    const rows = (await res.json()) as RawKline[]
    if (!rows.length) break
    out.unshift(...rows.map(toCandle))
    endTime = rows[0][0] - 1
    if (rows.length < limit) break
  }
  // drop the still-forming last bar: only closed candles are used
  const now = Date.now() / 1000
  const step = out.length > 1 ? out[1].time - out[0].time : 0
  if (out.length && out[out.length - 1].time + step > now) out.pop()
  return out
}

function toCandle(k: RawKline): Candle {
  return {
    time: Math.floor(k[0] / 1000),
    open: +k[1],
    high: +k[2],
    low: +k[3],
    close: +k[4],
    volume: +k[5],
    takerBuyVolume: Number(k[9]),
  }
}

export async function fetchUsdtPerpetuals(signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${BASE}/exchangeInfo`, { signal })
  if (!res.ok) throw new Error(`Binance Futures error ${res.status}`)
  const info = (await res.json()) as {
    symbols: { symbol: string; quoteAsset: string; contractType: string; status: string }[]
  }
  return info.symbols
    .filter((s) => s.quoteAsset === 'USDT' && s.contractType === 'PERPETUAL' && s.status === 'TRADING')
    .map((s) => s.symbol)
    .sort()
}
