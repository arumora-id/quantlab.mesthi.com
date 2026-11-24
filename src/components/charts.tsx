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
import { useI18n } from '../i18n/context'
import { useTheme } from '../theme/context'
import type { Theme } from '../theme/theme'
import { INDICATOR_BY_ID } from '../lib/backtest/catalog'
import { instanceLabel, type IndicatorInstance, type SeriesMap } from '../lib/backtest/rules'
import type { Candle, EquityPoint, Trade } from '../lib/backtest/types'

/** Indicator line colours per theme (darker shades keep contrast on the light background). */
const SERIES_COLORS: Record<Theme, string[]> = {
  dark: ['#38bdf8', '#f59e0b', '#a78bfa', '#f472b6', '#2dd4bf', '#facc15', '#fb923c', '#e2e8f0'],
  light: ['#0284c7', '#d97706', '#7c3aed', '#db2777', '#0d9488', '#a16207', '#ea580c', '#334155'],
}
const HISTOGRAM_OUTPUTS = new Set(['hist', 'delta', 'volume'])

/** Chart colours come from the active theme's CSS tokens. */
function palette() {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    text: v('--chart-text'),
    grid: v('--chart-grid'),
    border: v('--chart-border'),
    up: v('--color-up'),
    down: v('--color-down'),
    winSoft: v('--color-win-soft'),
    lossSoft: v('--color-loss-soft'),
    bench: v('--chart-bench'),
  }
}

function baseOptions(p: ReturnType<typeof palette>): DeepPartial<ChartOptions> {
  return {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: p.text,
      fontFamily: 'Inter, system-ui, sans-serif',
      panes: { separatorColor: p.border, separatorHoverColor: p.text },
    },
    grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
    rightPriceScale: { borderColor: p.border },
    timeScale: { borderColor: p.border, timeVisible: true },
    crosshair: { mode: 0 },
  }
}

const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a})`
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
  const { t: tr } = useI18n()
  const { theme } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const paneCount = instances.reduce((n, i) => {
    const def = INDICATOR_BY_ID[i.defId]
    if (def?.placement !== 'pane') return n
    return n + (def.separatePanes ? def.outputs.length : 1)
  }, 0)
  const height = 420 + paneCount * 150

  useEffect(() => {
    if (!ref.current || !candles.length) return
    const p = palette()
    const colors = SERIES_COLORS[theme]
    const chart = createChart(ref.current, baseOptions(p))
    const price = chart.addSeries(CandlestickSeries, {
      upColor: p.up,
      downColor: p.down,
      wickUpColor: p.up,
      wickDownColor: p.down,
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
        const c = colors[color++ % colors.length]
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
        const c = colors[color++ % colors.length]
        if (output === 'direction') continue
        const data = points(candles, out[output])
        if (HISTOGRAM_OUTPUTS.has(output)) {
          const s = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, paneIndex)
          s.setData(data.map((d) => ({ ...d, color: d.value >= 0 ? alpha(p.up, 0.6) : alpha(p.down, 0.6) })))
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
        color: long ? p.up : p.down,
        text: long ? 'L' : 'S',
      })
      markers.push({
        time: t(tr.exitTime),
        position: long ? 'aboveBar' : 'belowBar',
        shape: 'circle',
        color: tr.pnl >= 0 ? p.winSoft : p.lossSoft,
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
  }, [candles, instances, series, trades, onLegend, theme])

  return <div ref={ref} className="chart-box" style={{ height }} role="img" aria-label={tr.chart.price} />
}

export function EquityChart({ equity }: { equity: EquityPoint[] }) {
  const { theme } = useTheme()
  const { t: tr } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current || !equity.length) return
    const p = palette()
    const chart = createChart(ref.current, baseOptions(p))
    const strat = chart.addSeries(LineSeries, { color: p.up, lineWidth: 2, priceLineVisible: false })
    const bench = chart.addSeries(LineSeries, { color: p.bench, lineWidth: 1, lineStyle: 2, priceLineVisible: false })
    strat.setData(equity.map((p) => ({ time: t(p.time), value: p.equity })))
    bench.setData(equity.map((p) => ({ time: t(p.time), value: p.benchmark })))
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [equity, theme])
  return <div ref={ref} className="chart-box" style={{ height: 240 }} role="img" aria-label={tr.chart.equity} />
}
