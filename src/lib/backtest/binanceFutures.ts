import type { Candle } from './types'

/**
 * Binance USDⓈ-M Futures public market data (no API key).
 * The browser tries the same-origin proxy first (see deploy/nginx-binance-proxy.conf), so users
 * whose network blocks binance.com still get data; it falls back to Binance directly when the
 * proxy is not configured (the host then answers with HTML instead of JSON).
 */
export const DEFAULT_BASES = ['/api/binance/fapi/v1', 'https://fapi.binance.com/fapi/v1']
const MAX_LIMIT = 1500

export const INTERVALS = ['1d', '12h', '8h', '4h', '1h', '30m', '15m', '5m', '1m'] as const
export type Interval = (typeof INTERVALS)[number]
/** Every interval the client can fetch (charts use INTERVALS; higher-timeframe context may also use 1w). */
export type KlineInterval = Interval | '1w'

type RawKline = [number, string, string, string, string, string, ...unknown[]]

/** No data source answered: the network blocks Binance, or the device is offline. */
export class BinanceUnreachableError extends Error {
  constructor() {
    super('Binance Futures is unreachable')
  }
}

/** Binance answered with an error, e.g. an unknown symbol. */
export class BinanceApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** HTTP statuses that mean "this route cannot serve you" rather than "your request is wrong". */
const ROUTE_UNAVAILABLE = new Set([403, 418, 451, 502, 503, 504])

export function createBinanceClient(fetchFn: typeof fetch = (...a) => fetch(...a), bases = DEFAULT_BASES) {
  let preferred: string | null = null

  async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const order = preferred ? [preferred, ...bases.filter((b) => b !== preferred)] : bases
    let apiError: BinanceApiError | null = null
    for (const base of order) {
      let res: Response
      try {
        res = await fetchFn(`${base}${path}`, { signal })
      } catch (e) {
        if (signal?.aborted) throw e
        continue // blocked, offline, or refused by the browser
      }
      if (!(res.headers.get('content-type') ?? '').includes('json')) continue // proxy not set up
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        apiError = new BinanceApiError(body?.msg ?? `Binance Futures error ${res.status}`, res.status)
        if (ROUTE_UNAVAILABLE.has(res.status)) continue
        throw apiError
      }
      preferred = base
      return body as T
    }
    throw apiError ?? new BinanceUnreachableError()
  }

  /** Fetches up to `bars` closed candles, paging backwards from now. */
  async function klines(
    symbol: string,
    interval: KlineInterval,
    bars: number,
    signal?: AbortSignal,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<Candle[]> {
    const out: Candle[] = []
    let endTime: number | undefined
    while (out.length < bars) {
      const limit = Math.min(MAX_LIMIT, bars - out.length)
      const q = new URLSearchParams({ symbol: symbol.toUpperCase(), interval, limit: String(limit) })
      if (endTime !== undefined) q.set('endTime', String(endTime))
      const rows = await get<RawKline[]>(`/klines?${q}`, signal)
      if (!rows.length) break
      out.unshift(...rows.map(toCandle))
      onProgress?.(Math.min(out.length, bars), bars)
      endTime = rows[0][0] - 1
      if (rows.length < limit) break
    }
    // drop the still-forming last bar: only closed candles are used
    const now = Date.now() / 1000
    const step = out.length > 1 ? out[1].time - out[0].time : 0
    if (out.length && out[out.length - 1].time + step > now) out.pop()
    return out
  }

  async function usdtPerpetuals(signal?: AbortSignal): Promise<string[]> {
    const info = await get<{
      symbols: { symbol: string; quoteAsset: string; contractType: string; status: string }[]
    }>('/exchangeInfo', signal)
    return info.symbols
      .filter((s) => s.quoteAsset === 'USDT' && s.contractType === 'PERPETUAL' && s.status === 'TRADING')
      .map((s) => s.symbol)
      .sort()
  }

  return { klines, usdtPerpetuals }
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

const client = createBinanceClient()
export const fetchFuturesKlines = client.klines
export const fetchUsdtPerpetuals = client.usdtPerpetuals
