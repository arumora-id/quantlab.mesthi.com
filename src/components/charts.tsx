import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  type DeepPartial,
  type ChartOptions,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import { INDICATOR_BY_ID } from '../lib/backtest/catalog'
import { instanceLabel, type IndicatorInstance, type SeriesMap } from '../lib/backtest/rules'
import type { Candle, EquityPoint, Trade } from '../lib/backtest/types'

const SERIES_COLORS = ['#38bdf8', '#f59e0b', '#a78bfa', '#f472b6', '#2dd4bf', '#facc15', '#fb923c', '#e2e8f0']
const HISTOGRAM_OUTPUTS = new Set(['hist', 'delta', 'volume'])

const baseOptions: DeepPartial<ChartOptions> = {
  autoSize: true,
  layout: {
    background: { type: ColorType.Solid, color: 'transparent' },
    textColor: '#94a3b8',
    fontFamily: 'Inter, system-ui, sans-serif',
    panes: { separatorColor: '#334155', separatorHoverColor: '#475569' },
  },
  grid: { vertLines: { color: '#131a2e' }, horzLines: { color: '#131a2e' } },
  rightPriceScale: { borderColor: '#334155' },
  timeScale: { borderColor: '#334155', timeVisible: true },
  crosshair: { mode: 0 },
}

const t = (s: number) => s as UTCTimestamp
const points = (candles: Candle[], v: number[]) =>
  candles.flatMap((c, i) => (Number.isFinite(v[i]) ? [{ time: t(c.time), value: v[i] }] : []))

export interface LegendItem {
  label: string
  color: string
}

interface PriceChartProps {
  candles: Candle[]
  instances: IndicatorInstance[]
  series: SeriesMap
  trades: Trade[]
  onLegend?: (items: LegendItem[]) => void
}

export function PriceChart({ candles, instances, series, trades, onLegend }: PriceChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const paneCount = instances.reduce((n, i) => {
    const def = INDICATOR_BY_ID[i.defId]
    if (def?.placement !== 'pane') return n
    return n + (def.separatePanes ? def.outputs.length : 1)
  }, 0)
  const height = 420 + paneCount * 150

  useEffect(() => {
    if (!ref.current || !candles.length) return
    const chart = createChart(ref.current, baseOptions)
    const price = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      borderVisible: false,
    })
    price.setData(candles.map((c) => ({ time: t(c.time), open: c.open, high: c.high, low: c.low, close: c.close })))

    const legend: LegendItem[] = []
    const markers: SeriesMarker<Time>[] = []
    let color = 0
    let pane = 0

    for (const inst of instances) {
      const def = INDICATOR_BY_ID[inst.defId]
      const out = series[inst.id]
      if (!def || !out) continue
      if (def.placement === 'markers') {
        const c = SERIES_COLORS[color++ % SERIES_COLORS.length]
        legend.push({ label: `${inst.id} ▲▼ ${instanceLabel(inst)}`, color: c })
        candles.forEach((bar, i) => {
          const bull = out.bull?.[i] === 1 || (out.signal?.[i] === 1 && out.signal[i - 1] !== 1)
          const bear = out.bear?.[i] === 1 || (out.signal?.[i] === -1 && out.signal[i - 1] !== -1)
          if (bull) markers.push({ time: t(bar.time), position: 'belowBar', shape: 'arrowUp', color: c, size: 0.6 })
          if (bear) markers.push({ time: t(bar.time), position: 'aboveBar', shape: 'arrowDown', color: c, size: 0.6 })
        })
        continue
      }
      if (def.placement === 'pane' && !def.separatePanes) pane++
      for (const output of def.outputs) {
        if (def.placement === 'pane' && def.separatePanes) pane++
        const paneIndex = def.placement === 'pane' ? pane : 0
        const c = SERIES_COLORS[color++ % SERIES_COLORS.length]
        if (output === 'direction') continue
        const data = points(candles, out[output])
        if (HISTOGRAM_OUTPUTS.has(output)) {
          const s = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, paneIndex)
          s.setData(data.map((d) => ({ ...d, color: d.value >= 0 ? 'rgb(34 197 94 / 0.6)' : 'rgb(239 68 68 / 0.6)' })))
        } else {
          const s = chart.addSeries(
            LineSeries,
            { color: c, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false },
            paneIndex,
          )
          s.setData(data)
        }
        legend.push({ label: `${inst.id}.${output}`, color: c })
      }
    }

    for (const tr of trades) {
      const long = tr.side === 1
      markers.push({
        time: t(tr.entryTime),
        position: long ? 'belowBar' : 'aboveBar',
        shape: long ? 'arrowUp' : 'arrowDown',
        color: long ? '#22c55e' : '#ef4444',
        text: long ? 'L' : 'S',
      })
      markers.push({
        time: t(tr.exitTime),
        position: long ? 'aboveBar' : 'belowBar',
        shape: 'circle',
        color: tr.pnl >= 0 ? '#86efac' : '#fca5a5',
        text: tr.exitReason === 'signal' ? 'x' : tr.exitReason,
      })
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number))
    createSeriesMarkers(price, markers)

    const panes = chart.panes()
    panes.forEach((p, i) => i > 0 && p.setHeight(140))
    chart.timeScale().fitContent()
    onLegend?.(legend)
    return () => chart.remove()
  }, [candles, instances, series, trades, onLegend])

  return <div ref={ref} className="chart-box" style={{ height }} role="img" aria-label="Chart harga dengan indikator dan trade" />
}

export function EquityChart({ equity }: { equity: EquityPoint[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current || !equity.length) return
    const chart = createChart(ref.current, baseOptions)
    const strat = chart.addSeries(LineSeries, { color: '#22c55e', lineWidth: 2, priceLineVisible: false })
    const bench = chart.addSeries(LineSeries, { color: '#64748b', lineWidth: 1, lineStyle: 2, priceLineVisible: false })
    strat.setData(equity.map((p) => ({ time: t(p.time), value: p.equity })))
    bench.setData(equity.map((p) => ({ time: t(p.time), value: p.benchmark })))
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [equity])
  return <div ref={ref} className="chart-box" style={{ height: 240 }} role="img" aria-label="Kurva equity strategi dibanding buy and hold" />
}
