import { useMemo, useState } from 'react'
import { runBacktest } from '../lib/backtest/engine'
import { setupToStrategy, type Setup } from '../lib/backtest/rules'
import type { BacktestConfig, Candle, Metrics } from '../lib/backtest/types'
import { fixed, pct, plainPct, tone } from '../lib/format'

interface Row {
  setup: Setup
  source: 'Preset' | 'Tersimpan'
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
  config: BacktestConfig
  oosStart: number | null
  presets: Setup[]
  saved: Setup[]
  onLoad: (s: Setup) => void
}

export function ComparePanel({ candles, config, oosStart, presets, saved, onLoad }: Props) {
  const [sort, setSort] = useState<SortKey>('oos')

  const rows = useMemo<Row[]>(() => {
    const all = [
      ...presets.map((s) => ({ setup: s, source: 'Preset' as const })),
      ...saved.map((s) => ({ setup: s, source: 'Tersimpan' as const })),
    ]
    return all.map(({ setup, source }) => {
      const strat = setupToStrategy(setup)
      return {
        setup,
        source,
        full: runBacktest(candles, strat, {}, config).metrics,
        oos: oosStart !== null ? runBacktest(candles, strat, {}, config, oosStart).metrics : null,
      }
    })
  }, [candles, config, oosStart, presets, saved])

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
        <h2 id="cmp-title">Bandingkan setup pada data ini</h2>
      </div>
      <p className="alert info" style={{ margin: 0 }}>
        Setup terbaik di data historis belum tentu profitable ke depan. Pilih berdasarkan hasil out-of-sample, jumlah trade
        yang cukup, dan drawdown — bukan hanya total return.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Setup</th>
              {head('total', 'Return')}
              {oosStart !== null && head('oos', 'OOS return')}
              {head('sharpe', 'Sharpe')}
              {head('dd', 'Max DD')}
              {head('pf', 'Profit factor')}
              {head('win', 'Win rate')}
              <th scope="col">Trades</th>
              <th scope="col">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={`${r.source}:${r.setup.name}`}>
                <td>
                  {r.setup.name} <span className="badge">{r.source}</span>
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
                    Buka
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
