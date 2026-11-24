import { NumberField } from './NumberField'
import type { BacktestConfig } from '../lib/backtest/types'

interface Props {
  value: BacktestConfig
  onChange: (v: BacktestConfig) => void
  oosPct: number
  onOosChange: (v: number) => void
}

const NUMBER_FIELDS: { key: keyof BacktestConfig; label: string; min: number; max: number; step: number }[] = [
  { key: 'initialCapital', label: 'Modal (USDT)', min: 10, max: 10_000_000, step: 100 },
  { key: 'leverage', label: 'Leverage (x)', min: 1, max: 125, step: 1 },
  { key: 'feeBps', label: 'Fee per sisi (bps)', min: 0, max: 100, step: 0.5 },
  { key: 'slippageBps', label: 'Slippage (bps)', min: 0, max: 100, step: 0.5 },
  { key: 'stopLossPct', label: 'Stop loss % (0 = off)', min: 0, max: 100, step: 0.5 },
  { key: 'takeProfitPct', label: 'Take profit % (0 = off)', min: 0, max: 1000, step: 0.5 },
]

export function RiskPanel({ value, onChange, oosPct, onOosChange }: Props) {
  return (
    <section className="card panel" aria-labelledby="risk-title">
      <div className="panel-head">
        <h2 id="risk-title">Eksekusi & risiko</h2>
      </div>
      <div className="grid-2">
        {NUMBER_FIELDS.map((f) => (
          <label className="field" key={f.key}>
            <span>{f.label}</span>
            <NumberField
              min={f.min}
              max={f.max}
              step={f.step}
              value={value[f.key] as number}
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
        Izinkan short
      </label>
      <label className="field">
        <span>Out-of-sample: {oosPct}% bar terakhir</span>
        <input type="range" min={0} max={50} step={5} value={oosPct} onChange={(e) => onOosChange(Number(e.target.value))} />
      </label>
      <small className="muted">
        Fee default 5 bps = taker 0,05%. Funding rate belum dihitung. Likuidasi disederhanakan (margin habis, tanpa
        maintenance margin).
      </small>
    </section>
  )
}
