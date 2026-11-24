import { useI18n } from '../i18n/context'
import type { BacktestResult, Metrics } from '../lib/backtest/types'
import { day, money, pct, plainPct, tone } from '../lib/format'
import { verdictOf } from '../lib/simple'

interface Props {
  result: BacktestResult
  oos: Metrics | null
  oosPct: number
  capital: number
}


/** Plain-language result for beginners: one sentence, a verdict, and four explained numbers. */
export function SimpleSummary({ result, oos, oosPct, capital }: Props) {
  const { t } = useI18n()
  const m = result.metrics
  const s = t.simple
  const eq = result.equity
  const verdict = verdictOf(m)
  const verdictText = {
    noTrades: s.verdictNoTrades,
    beat: s.verdictBeat,
    profitBehind: s.verdictProfitBehind,
    loss: s.verdictLoss,
  }[verdict]
  const wins = Math.round(m.winRate * m.trades)
  const liquidated = result.trades.some((tr) => tr.exitReason === 'liquidation')
  const dateOnly = (ts: number) => day(ts, t.locale)

  const cards: { label: string; value: string; cls: string; hint: string }[] = [
    {
      label: s.finalEquity,
      value: `${money(m.finalEquity, t.locale)} USDT`,
      cls: tone(m.finalEquity - capital),
      hint: s.finalEquityHint(money(capital, t.locale)),
    },
    { label: s.result, value: pct(m.totalReturn), cls: tone(m.totalReturn), hint: s.resultHint(pct(m.benchmarkReturn)) },
    { label: s.drawdown, value: `-${plainPct(m.maxDrawdown)}`, cls: m.maxDrawdown > 0 ? 'down' : '', hint: s.drawdownHint },
    { label: s.wins, value: m.trades ? plainPct(m.winRate, 0) : '—', cls: '', hint: s.winsHint(wins, m.trades) },
  ]

  return (
    <section className="card summary" aria-labelledby="sum-title">
      <h2 id="sum-title" className="sr-only">
        {s.summaryTitle}
      </h2>
      <div className={`verdict verdict-${verdict}`} role="status">
        <strong>{verdictText}</strong>
        {eq.length > 0 && (
          <span>
            {s.summary(
              dateOnly(eq[0].time),
              dateOnly(eq[eq.length - 1].time),
              money(capital, t.locale),
              money(m.finalEquity, t.locale),
            )}
          </span>
        )}
      </div>
      {liquidated && <p className="alert error" style={{ margin: 0 }}>{s.liquidated}</p>}
      {oos && m.totalReturn > 0 && oos.totalReturn < 0 && (
        <p className="alert warn-box" style={{ margin: 0 }}>
          {s.oosWarn(oosPct)}
        </p>
      )}
      <div className="simple-metrics">
        {cards.map((c) => (
          <div className="metric card" key={c.label}>
            <span>{c.label}</span>
            <strong className={`num ${c.cls}`}>{c.value}</strong>
            <small className="muted">{c.hint}</small>
          </div>
        ))}
      </div>
    </section>
  )
}
