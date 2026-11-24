import { NumberField } from './NumberField'
import type { BacktestConfig } from '../lib/backtest/types'
import { useI18n } from '../i18n/context'

interface Props {
  value: BacktestConfig
  onChange: (v: BacktestConfig) => void
  oosPct: number
  onOosChange: (v: number) => void
}

type NumberKey = 'initialCapital' | 'leverage' | 'feeBps' | 'slippageBps' | 'stopLossPct' | 'takeProfitPct'

const NUMBER_FIELDS: { key: NumberKey; min: number; max: number; step: number }[] = [
  { key: 'initialCapital', min: 10, max: 10_000_000, step: 100 },
  { key: 'leverage', min: 1, max: 125, step: 1 },
  { key: 'feeBps', min: 0, max: 100, step: 0.5 },
  { key: 'slippageBps', min: 0, max: 100, step: 0.5 },
  { key: 'stopLossPct', min: 0, max: 100, step: 0.5 },
  { key: 'takeProfitPct', min: 0, max: 1000, step: 0.5 },
]

export function RiskPanel({ value, onChange, oosPct, onOosChange }: Props) {
  const { t } = useI18n()
  return (
    <section className="card panel" aria-labelledby="risk-title">
      <div className="panel-head">
        <h2 id="risk-title">{t.risk.title}</h2>
      </div>
      <div className="grid-2">
        {NUMBER_FIELDS.map((f) => (
          <label className="field" key={f.key}>
            <span>{t.risk[f.key]}</span>
            <NumberField
              min={f.min}
              max={f.max}
              step={f.step}
              value={value[f.key]}
              onChange={(n) => onChange({ ...value, [f.key]: n })}
            />
          </label>
        ))}
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={value.allowShort}
          onChange={(e) => onChange({ ...value, allowShort: e.target.checked })}
        />
        {t.risk.allowShort}
      </label>
      <label className="field">
        <span>{t.risk.oos(oosPct)}</span>
        <input type="range" min={0} max={50} step={5} value={oosPct} onChange={(e) => onOosChange(Number(e.target.value))} />
      </label>
      <small className="muted">{t.risk.note}</small>
    </section>
  )
}
