import { useMemo, useState } from 'react'
import { runSetup } from '../lib/backtest/runSetup'
import type { Setup } from '../lib/backtest/rules'
import type { HtfData } from '../lib/backtest/timeframe'
import type { BacktestConfig, Candle, Metrics } from '../lib/backtest/types'
import { fixed, pct, plainPct, tone } from '../lib/format'
import { useI18n } from '../i18n/context'

interface Row {
  setup: Setup
  source: 'preset' | 'saved'
  full: Metrics
  oos: Metrics | null
}

type SortKey = 'total' | 'oos' | 'sharpe' | 'dd' | 'pf' | 'win'

const SORTS: Record<SortKey, (r: Row) => number> = {
  total: (r) => r.full.totalReturn,
  oos: (r) => r.oos?.totalReturn ?? -Infinity,
  sharpe: (r) => r.full.sharpe,
  dd: (r) => -r.full.maxDrawdown,
  pf: (r) => (Number.isFinite(r.full.profitFactor) ? r.full.profitFactor : 1e9),
  win: (r) => r.full.winRate,
}

interface Props {
  candles: Candle[]
  htf: HtfData
  config: BacktestConfig
  oosStart: number | null
  presets: Setup[]
  saved: Setup[]
  onLoad: (s: Setup) => void
}

export function ComparePanel({ candles, htf, config, oosStart, presets, saved, onLoad }: Props) {
  const { t } = useI18n()
  const [sort, setSort] = useState<SortKey>('oos')

  const rows = useMemo<Row[]>(() => {
    const all = [
      ...presets.map((s) => ({ setup: s, source: 'preset' as const })),
      ...saved.map((s) => ({ setup: s, source: 'saved' as const })),
    ]
    return all.map(({ setup, source }) => ({
      setup,
      source,
      full: runSetup(candles, setup, config, 0, htf).metrics,
      oos: oosStart !== null ? runSetup(candles, setup, config, oosStart, htf).metrics : null,
    }))
  }, [candles, htf, config, oosStart, presets, saved])

  const sorted = [...rows].sort((a, b) => SORTS[sort](b) - SORTS[sort](a))
  const head = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort === key ? 'descending' : 'none'}>
      <button type="button" aria-pressed={sort === key} onClick={() => setSort(key)}>
        {label}
        {sort === key ? ' ↓' : ''}
      </button>
    </th>
  )

  return (
    <section className="card chart-card" aria-labelledby="cmp-title">
      <div className="panel-head">
        <h2 id="cmp-title">{t.compare.title}</h2>
      </div>
      <p className="alert info" style={{ margin: 0 }}>
        {t.compare.warning}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">{t.compare.setup}</th>
              {head('total', t.compare.ret)}
              {oosStart !== null && head('oos', t.compare.oos)}
              {head('sharpe', t.compare.sharpe)}
              {head('dd', t.compare.dd)}
              {head('pf', t.compare.pf)}
              {head('win', t.compare.win)}
              <th scope="col">{t.compare.trades}</th>
              <th scope="col">
                <span className="sr-only">{t.compare.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={`${r.source}:${r.setup.name}`}>
                <td>
                  {r.setup.name} <span className="badge">{t.compare[r.source]}</span>
                  {r.setup.research && (
                    <span className="badge research" title={t.simple.researchHint}>
                      {t.simple.research}
                    </span>
                  )}
                </td>
                <td className={`num ${tone(r.full.totalReturn)}`}>{pct(r.full.totalReturn)}</td>
                {oosStart !== null && <td className={`num ${tone(r.oos!.totalReturn)}`}>{pct(r.oos!.totalReturn)}</td>}
                <td className="num">{fixed(r.full.sharpe)}</td>
                <td className="num down">{plainPct(r.full.maxDrawdown)}</td>
                <td className="num">{fixed(r.full.profitFactor)}</td>
                <td className="num">{plainPct(r.full.winRate)}</td>
                <td className="num">{r.full.trades}</td>
                <td>
                  <button type="button" className="btn btn-sm" onClick={() => onLoad(r.setup)}>
                    {t.compare.open}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
