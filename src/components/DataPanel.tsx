import { useEffect, useId, useState } from 'react'
import { useI18n } from '../i18n/context'
import { fetchUsdtPerpetuals, INTERVALS, type Interval } from '../lib/backtest/binanceFutures'
import { Icon } from './Icon'
import { NumberField } from './NumberField'
import { PairPicker } from './PairPicker'

export interface DataRequest {
  symbol: string
  interval: Interval
  bars: number
}

interface Props {
  value: DataRequest
  onChange: (v: DataRequest) => void
  /** Loads the given request (picking a pair or timeframe loads right away). */
  onLoad: (req: DataRequest) => void
  loading: boolean
  loadedInfo: string | null
}

export function DataPanel({ value, onChange, onLoad, loading, loadedInfo }: Props) {
  const { t } = useI18n()
  const [symbols, setSymbols] = useState<string[] | null>(null)
  const pairLabel = useId()

  useEffect(() => {
    const ctrl = new AbortController()
    fetchUsdtPerpetuals(ctrl.signal)
      .then(setSymbols)
      .catch(() => {
        if (!ctrl.signal.aborted) setSymbols([])
      })
    return () => ctrl.abort()
  }, [])

  const apply = (next: DataRequest) => {
    onChange(next)
    onLoad(next)
  }

  return (
    <section className="card panel" aria-labelledby="data-title">
      <div className="panel-head">
        <h2 id="data-title">{t.data.title}</h2>
      </div>
      <form
        className="panel"
        style={{ padding: 0 }}
        onSubmit={(e) => {
          e.preventDefault()
          onLoad(value)
        }}
      >
        <div className="field">
          <span id={pairLabel}>{t.data.pair}</span>
          <PairPicker
            value={value.symbol}
            symbols={symbols}
            labelId={pairLabel}
            onPick={(symbol) => apply({ ...value, symbol })}
          />
        </div>
        <div className="grid-2">
          <label className="field">
            <span>{t.data.timeframe}</span>
            <select
              className="input"
              value={value.interval}
              onChange={(e) => apply({ ...value, interval: e.target.value as Interval })}
            >
              {INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t.data.bars}</span>
            <NumberField
              min={100}
              max={5000}
              step={100}
              value={value.bars}
              onChange={(bars) => onChange({ ...value, bars })}
            />
          </label>
        </div>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? <span className="spinner" aria-hidden="true" /> : <Icon name="refresh" />}
          {loading ? t.data.loading : t.data.load}
        </button>
        {loadedInfo && <small className="muted">{loadedInfo}</small>}
      </form>
    </section>
  )
}
