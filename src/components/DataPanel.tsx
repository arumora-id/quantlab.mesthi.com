import { useEffect, useId, useState } from 'react'
import { fetchUsdtPerpetuals, INTERVALS, type Interval } from '../lib/backtest/binanceFutures'
import { Icon } from './Icon'
import { NumberField } from './NumberField'

export interface DataRequest {
  symbol: string
  interval: Interval
  bars: number
}

interface Props {
  value: DataRequest
  onChange: (v: DataRequest) => void
  onLoad: () => void
  loading: boolean
  loadedInfo: string | null
}

export function DataPanel({ value, onChange, onLoad, loading, loadedInfo }: Props) {
  const [symbols, setSymbols] = useState<string[]>([])
  const listId = useId()

  useEffect(() => {
    const ctrl = new AbortController()
    fetchUsdtPerpetuals(ctrl.signal)
      .then(setSymbols)
      .catch(() => setSymbols([]))
    return () => ctrl.abort()
  }, [])

  return (
    <section className="card panel" aria-labelledby="data-title">
      <div className="panel-head">
        <h2 id="data-title">Data · Binance Futures USDT-M</h2>
      </div>
      <form
        className="panel"
        style={{ padding: 0 }}
        onSubmit={(e) => {
          e.preventDefault()
          onLoad()
        }}
      >
        <label className="field">
          <span>Pair perpetual</span>
          <input
            className="input"
            list={listId}
            value={value.symbol}
            onChange={(e) => onChange({ ...value, symbol: e.target.value.toUpperCase().trim() })}
            autoComplete="off"
            spellCheck={false}
          />
          <datalist id={listId}>
            {symbols.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Timeframe</span>
            <select
              className="input"
              value={value.interval}
              onChange={(e) => onChange({ ...value, interval: e.target.value as Interval })}
            >
              {INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Jumlah bar</span>
            <NumberField
              min={100}
              max={5000}
              step={100}
              value={value.bars}
              onChange={(bars) => onChange({ ...value, bars })}
            />
          </label>
        </div>
        <button className="btn" type="submit" disabled={loading || !value.symbol}>
          {loading ? <span className="spinner" aria-hidden="true" /> : <Icon name="refresh" />}
          {loading ? 'Memuat…' : 'Muat data'}
        </button>
        {loadedInfo && <small className="muted">{loadedInfo}</small>}
      </form>
    </section>
  )
}
