import { useId } from 'react'
import { useI18n } from '../i18n/context'
import type { Interval } from '../lib/backtest/binanceFutures'
import type { Setup } from '../lib/backtest/rules'
import type { BacktestConfig } from '../lib/backtest/types'
import { barsFor, isCapped } from '../lib/simple'
import type { DataRequest } from './DataPanel'
import { NumberField } from './NumberField'
import { PairPicker } from './PairPicker'
import { usePerpetualSymbols } from './usePerpetualSymbols'

const TIMEFRAMES: Interval[] = ['1d', '4h', '1h', '15m', '1m']
const PERIOD_DAYS = [182, 365, 730, 1460]
const LEVERAGES = [1, 2, 3, 5, 10]
const STOPS = [0, 3, 5, 10]

interface Props {
  request: DataRequest
  periodDays: number
  onData: (req: DataRequest, periodDays: number) => void
  loadedInfo: string | null
  setup: Setup
  presets: Setup[]
  onPreset: (s: Setup) => void
  config: BacktestConfig
  onConfig: (c: BacktestConfig) => void
}

function Chips<T extends string | number>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string
  options: T[]
  value: T
  onChange: (v: T) => void
  render: (v: T) => string
}) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={o === value} onClick={() => onChange(o)}>
          {render(o)}
        </button>
      ))}
    </div>
  )
}

/** Beginner sidebar: three plain steps instead of the full builder. */
export function SimpleSidebar({
  request,
  periodDays,
  onData,
  loadedInfo,
  setup,
  presets,
  onPreset,
  config,
  onConfig,
}: Props) {
  const { t } = useI18n()
  const symbols = usePerpetualSymbols()
  const pairLabel = useId()
  const interval = TIMEFRAMES.includes(request.interval) ? request.interval : '1d'
  const capped = isCapped(interval, periodDays)
  const isPreset = presets.some((p) => p.name === setup.name)

  const setData = (patch: Partial<DataRequest>, days = periodDays) => {
    const next = { ...request, ...patch }
    onData({ ...next, bars: barsFor(next.interval, days) }, days)
  }

  return (
    <>
      <section className="card panel step" aria-labelledby="s1">
        <h2 id="s1" className="step-title">
          {t.simple.step1}
        </h2>
        <div className="field">
          <span id={pairLabel}>{t.data.pair}</span>
          <PairPicker value={request.symbol} symbols={symbols} labelId={pairLabel} onPick={(symbol) => setData({ symbol })} />
        </div>
        <div className="field">
          <span>{t.simple.candle}</span>
          <Chips
            label={t.simple.candle}
            options={TIMEFRAMES}
            value={interval}
            onChange={(i) => setData({ interval: i })}
            render={(i) => t.simple.timeframes[i] ?? i}
          />
        </div>
        <div className="field">
          <span>{t.simple.period}</span>
          <Chips
            label={t.simple.period}
            options={PERIOD_DAYS}
            value={periodDays}
            onChange={(d) => setData({}, d)}
            render={(d) => t.simple.periods[d] ?? `${d}`}
          />
          {capped && <small className="muted">{t.simple.capped}</small>}
        </div>
        {loadedInfo && <small className="muted">{loadedInfo}</small>}
      </section>

      <section className="card panel step" aria-labelledby="s2">
        <h2 id="s2" className="step-title">
          {t.simple.step2}
        </h2>
        <div className="strategy-list" role="radiogroup" aria-labelledby="s2">
          {presets.map((p) => {
            const info = t.simple.presets[p.name]
            return (
              <button
                key={p.name}
                type="button"
                role="radio"
                aria-checked={p.name === setup.name}
                className="strategy-card"
                onClick={() => {
                  onPreset(p)
                  if (p.preferredInterval && p.preferredInterval !== interval) setData({ interval: p.preferredInterval })
                }}
              >
                <span className="strategy-head">
                  <strong>{p.name}</strong>
                  <span className="badges">
                    {p.research && (
                      <span className="badge research" title={t.simple.researchHint}>
                        {t.simple.research}
                      </span>
                    )}
                    {info && <span className="badge">{info.tag}</span>}
                  </span>
                </span>
                {info && <span className="strategy-desc">{info.desc}</span>}
              </button>
            )
          })}
        </div>
        {!isPreset && <p className="alert info" style={{ margin: 0 }}>{t.simple.custom(setup.name)}</p>}
      </section>

      <section className="card panel step" aria-labelledby="s3">
        <h2 id="s3" className="step-title">
          {t.simple.step3}
        </h2>
        <label className="field">
          <span>{t.simple.capital}</span>
          <NumberField
            min={10}
            max={10_000_000}
            step={100}
            value={config.initialCapital}
            onChange={(initialCapital) => onConfig({ ...config, initialCapital })}
          />
        </label>
        {setup.model ? (
          <p className="alert info" style={{ margin: 0 }}>
            {t.simple.modelNote(setup.model.targetVol)}
          </p>
        ) : (
          <>
        <div className="field">
          <span>{t.simple.leverage}</span>
          <Chips
            label={t.simple.leverage}
            options={LEVERAGES}
            value={LEVERAGES.includes(config.leverage) ? config.leverage : 1}
            onChange={(leverage) => onConfig({ ...config, leverage })}
            render={(x) => `${x}x`}
          />
          {config.leverage > 1 && <small className="warn">{t.simple.leverageWarn(config.leverage)}</small>}
        </div>
        <div className="field">
          <span>{t.simple.stopLoss}</span>
          <Chips
            label={t.simple.stopLoss}
            options={STOPS}
            value={STOPS.includes(config.stopLossPct) ? config.stopLossPct : 0}
            onChange={(stopLossPct) => onConfig({ ...config, stopLossPct })}
            render={(v) => (v === 0 ? t.simple.off : `${v}%`)}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={config.allowShort}
            onChange={(e) => onConfig({ ...config, allowShort: e.target.checked })}
          />
          {t.simple.allowShort}
        </label>
          </>
        )}
      </section>
    </>
  )
}
