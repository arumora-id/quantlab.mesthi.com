import { describe, expect, it, vi } from 'vitest'
import { BinanceApiError, BinanceUnreachableError, createBinanceClient } from './binanceFutures'

const PROXY = '/proxy'
const DIRECT = 'https://direct'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const html = () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
const info = { symbols: [{ symbol: 'BTCUSDT', quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING' }] }

function client(handler: (url: string) => Response | Promise<Response>) {
  const fetchFn = vi.fn(async (url: string | URL | Request) => handler(String(url)))
  return { fetchFn, api: createBinanceClient(fetchFn as unknown as typeof fetch, [PROXY, DIRECT]) }
}

describe('Binance client', () => {
  it('uses the same-origin proxy when it answers with JSON', async () => {
    const { fetchFn, api } = client((url) => (url.startsWith(PROXY) ? json(info) : json({}, 500)))
    await expect(api.usdtPerpetuals()).resolves.toEqual(['BTCUSDT'])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('falls back to Binance directly when the proxy is not set up (HTML answer)', async () => {
    const { api } = client((url) => (url.startsWith(PROXY) ? html() : json(info)))
    await expect(api.usdtPerpetuals()).resolves.toEqual(['BTCUSDT'])
  })

  it('remembers the source that worked', async () => {
    const { fetchFn, api } = client((url) => (url.startsWith(PROXY) ? html() : json(info)))
    await api.usdtPerpetuals()
    await api.usdtPerpetuals()
    expect(fetchFn.mock.calls.map((c) => String(c[0]).startsWith(DIRECT))).toEqual([false, true, true])
  })

  it('reports "unreachable" when every source fails at the network level', async () => {
    const { api } = client(() => {
      throw new TypeError('Failed to fetch')
    })
    await expect(api.usdtPerpetuals()).rejects.toBeInstanceOf(BinanceUnreachableError)
  })

  it('surfaces a real Binance error such as an invalid symbol', async () => {
    const { api } = client(() => json({ code: -1121, msg: 'Invalid symbol.' }, 400))
    await expect(api.klines('NOPEUSDT', '1d', 10)).rejects.toEqual(new BinanceApiError('Invalid symbol.', 400))
  })

  it('tries the next source when one is geo-restricted (451)', async () => {
    const { api } = client((url) => (url.startsWith(PROXY) ? json({ msg: 'restricted location' }, 451) : json(info)))
    await expect(api.usdtPerpetuals()).resolves.toEqual(['BTCUSDT'])
  })
})
