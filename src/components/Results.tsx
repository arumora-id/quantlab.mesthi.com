import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { prefersReducedMotion } from '../lib/motion'
import { useRef } from 'react'
import { date, fixed, money, pct, plainPct, price, tone } from '../lib/format'
import type { Metrics, Trade } from '../lib/backtest/types'

export function MetricsGrid({ m, oos, oosPct }: { m: Metrics; oos: Metrics | null; oosPct: number }) {
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
    ['Total return', pct(m.totalReturn), tone(m.totalReturn)],
    ['Buy & hold', pct(m.benchmarkReturn), tone(m.benchmarkReturn)],
    ['CAGR', pct(m.cagr), tone(m.cagr)],
    ['Max drawdown', plainPct(m.maxDrawdown), m.maxDrawdown > 0 ? 'down' : ''],
    ['Sharpe', fixed(m.sharpe)],
    ['Win rate', plainPct(m.winRate)],
    ['Profit factor', fixed(m.profitFactor)],
    ['Trades', String(m.trades)],
    ['Rata-rata trade', pct(m.avgTradeReturn), tone(m.avgTradeReturn)],
    ['Exposure', plainPct(m.exposure)],
    ['Equity akhir', money(m.finalEquity)],
  ]
  if (oos) items.push([`OOS ${oosPct}% return`, pct(oos.totalReturn), tone(oos.totalReturn)], [`OOS Sharpe`, fixed(oos.sharpe)])
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

const REASONS: Record<Trade['exitReason'], string> = {
  signal: 'sinyal',
  stop: 'stop loss',
  target: 'take profit',
  liquidation: 'likuidasi',
  end: 'akhir data',
}

export function TradesTable({ trades }: { trades: Trade[] }) {
  if (!trades.length) return <p className="empty">Tidak ada trade untuk setup ini.</p>
  return (
    <div className="table-wrap" style={{ maxHeight: 420 }}>
      <table>
        <thead>
          <tr>
            <th scope="col">Sisi</th>
            <th scope="col">Entry</th>
            <th scope="col">Harga entry</th>
            <th scope="col">Exit</th>
            <th scope="col">Harga exit</th>
            <th scope="col">Bar</th>
            <th scope="col">Alasan</th>
            <th scope="col">PnL (USDT)</th>
            <th scope="col">Return</th>
          </tr>
        </thead>
        <tbody>
          {[...trades].reverse().map((t) => (
            <tr key={`${t.entryTime}-${t.exitTime}-${t.side}`}>
              <td>
                <span className={`badge ${t.side === 1 ? 'long' : 'short'}`}>{t.side === 1 ? 'LONG' : 'SHORT'}</span>
              </td>
              <td>{date(t.entryTime)}</td>
              <td className="num">{price(t.entryPrice)}</td>
              <td>{date(t.exitTime)}</td>
              <td className="num">{price(t.exitPrice)}</td>
              <td className="num">{t.bars}</td>
              <td>{REASONS[t.exitReason]}</td>
              <td className={`num ${tone(t.pnl)}`}>{money(t.pnl)}</td>
              <td className={`num ${tone(t.returnPct)}`}>{pct(t.returnPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
