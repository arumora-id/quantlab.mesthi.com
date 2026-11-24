import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { prefersReducedMotion } from '../lib/motion'
import { useRef } from 'react'
import { date, fixed, money, pct, plainPct, price, tone } from '../lib/format'
import type { Metrics, Trade } from '../lib/backtest/types'
import { useI18n } from '../i18n/context'

export function MetricsGrid({ m, oos, oosPct }: { m: Metrics; oos: Metrics | null; oosPct: number }) {
  const { t } = useI18n()
  const root = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      gsap.from('.metric', {
        opacity: 0,
        y: 12,
        scale: 0.96,
        duration: 0.35,
        stagger: { each: 0.03, grid: 'auto', from: 'start' },
        ease: 'back.out(1.4)',
      })
    },
    { scope: root, dependencies: [m] },
  )
  const items: [string, string, string?][] = [
    [t.metrics.totalReturn, pct(m.totalReturn), tone(m.totalReturn)],
    [t.metrics.buyHold, pct(m.benchmarkReturn), tone(m.benchmarkReturn)],
    [t.metrics.cagr, pct(m.cagr), tone(m.cagr)],
    [t.metrics.maxDrawdown, plainPct(m.maxDrawdown), m.maxDrawdown > 0 ? 'down' : ''],
    [t.metrics.sharpe, fixed(m.sharpe)],
    [t.metrics.winRate, plainPct(m.winRate)],
    [t.metrics.profitFactor, fixed(m.profitFactor)],
    [t.metrics.trades, String(m.trades)],
    [t.metrics.avgTrade, pct(m.avgTradeReturn), tone(m.avgTradeReturn)],
    [t.metrics.exposure, plainPct(m.exposure)],
    [t.metrics.finalEquity, money(m.finalEquity, t.locale)],
  ]
  if (oos)
    items.push(
      [t.metrics.oosReturn(oosPct), pct(oos.totalReturn), tone(oos.totalReturn)],
      [t.metrics.oosSharpe, fixed(oos.sharpe)],
    )
  return (
    <div className="metrics" ref={root}>
      {items.map(([label, value, cls]) => (
        <div className="card metric" key={label}>
          <span>{label}</span>
          <strong className={`num ${cls ?? ''}`}>{value}</strong>
        </div>
      ))}
    </div>
  )
}

export function TradesTable({ trades }: { trades: Trade[] }) {
  const { t: tr } = useI18n()
  if (!trades.length) return <p className="empty">{tr.trades.empty}</p>
  return (
    <div className="table-wrap" style={{ maxHeight: 420 }}>
      <table>
        <thead>
          <tr>
            <th scope="col">{tr.trades.side}</th>
            <th scope="col">{tr.trades.entry}</th>
            <th scope="col">{tr.trades.entryPrice}</th>
            <th scope="col">{tr.trades.exit}</th>
            <th scope="col">{tr.trades.exitPrice}</th>
            <th scope="col">{tr.trades.bars}</th>
            <th scope="col">{tr.trades.reason}</th>
            <th scope="col">{tr.trades.pnl}</th>
            <th scope="col">{tr.trades.ret}</th>
          </tr>
        </thead>
        <tbody>
          {[...trades].reverse().map((t) => (
            <tr key={`${t.entryTime}-${t.exitTime}-${t.side}`}>
              <td>
                <span className={`badge ${t.side === 1 ? 'long' : 'short'}`}>{t.side === 1 ? 'LONG' : 'SHORT'}</span>
              </td>
              <td>{date(t.entryTime, tr.locale)}</td>
              <td className="num">{price(t.entryPrice)}</td>
              <td>{date(t.exitTime, tr.locale)}</td>
              <td className="num">{price(t.exitPrice)}</td>
              <td className="num">{t.bars}</td>
              <td>{tr.trades.reasons[t.exitReason]}</td>
              <td className={`num ${tone(t.pnl)}`}>{money(t.pnl, tr.locale)}</td>
              <td className={`num ${tone(t.returnPct)}`}>{pct(t.returnPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
