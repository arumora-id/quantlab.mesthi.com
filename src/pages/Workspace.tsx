import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/context'
import { EquityChart, PriceChart, type LegendItem } from '../components/charts'
import { ComparePanel } from '../components/ComparePanel'
import { DataPanel, type DataRequest } from '../components/DataPanel'
import { Icon } from '../components/Icon'
import { LangSwitch } from '../components/LangSwitch'
import { MetricsGrid, TradesTable } from '../components/Results'
import { RiskPanel } from '../components/RiskPanel'
import { SetupBuilder } from '../components/SetupBuilder'
import { fetchFuturesKlines } from '../lib/backtest/binanceFutures'
import { runBacktest } from '../lib/backtest/engine'
import { PRESETS } from '../lib/backtest/presets'
import { computeIndicators, setupToStrategy, type Setup } from '../lib/backtest/rules'
import type { BacktestConfig, Candle } from '../lib/backtest/types'
import { date } from '../lib/format'
import { deleteSetup, loadSetups, saveSetup } from '../lib/setupsStore'
import { useI18n } from '../i18n/context'

const DEFAULT_CONFIG: BacktestConfig = {
  initialCapital: 10_000,
  feeBps: 5,
  slippageBps: 2,
  allowShort: true,
  leverage: 1,
  stopLossPct: 0,
  takeProfitPct: 0,
}

type View = 'backtest' | 'compare'

export default function Workspace() {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const email = user!.email
  const [view, setView] = useState<View>('backtest')
  const [request, setRequest] = useState<DataRequest>({ symbol: 'BTCUSDT', interval: '1d', bars: 1500 })
  const [candles, setCandles] = useState<Candle[]>([])
  const [loaded, setLoaded] = useState<DataRequest | null>(null)
  const [loading, setLoading] = useState(false)
  /** Either a message from Binance, or a translatable local error. */
  const [error, setError] = useState<
    { kind: 'raw'; message: string } | { kind: 'tooFew'; n: number; req: DataRequest } | { kind: 'failed' } | null
  >(null)
  const [setup, setSetup] = useState<Setup>(() => structuredClone(PRESETS[0]))
  const [saved, setSaved] = useState<Setup[]>(() => loadSetups(email))
  const [config, setConfig] = useState<BacktestConfig>(DEFAULT_CONFIG)
  const [oosPct, setOosPct] = useState(30)
  const [legend, setLegend] = useState<LegendItem[]>([])
  const abort = useRef<AbortController | null>(null)

  const load = useCallback(async (req: DataRequest) => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setLoading(true)
    setError(null)
    try {
      const data = await fetchFuturesKlines(req.symbol, req.interval, req.bars, ctrl.signal)
      if (data.length < 50) {
        setError({ kind: 'tooFew', n: data.length, req })
        return
      }
      setCandles(data)
      setLoaded(req)
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? { kind: 'raw', message: e.message } : { kind: 'failed' })
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [])

  // load default market once
  const initial = useRef(request)
  useEffect(() => {
    load(initial.current)
    return () => abort.current?.abort()
  }, [load])

  // keep typing responsive: heavy recomputation follows a deferred copy of the inputs
  const dSetup = useDeferredValue(setup)
  const dConfig = useDeferredValue(config)
  const oosStart = oosPct > 0 && candles.length ? Math.floor(candles.length * (1 - oosPct / 100)) : null

  const computed = useMemo(() => {
    if (!candles.length) return null
    const strat = setupToStrategy(dSetup)
    return {
      series: computeIndicators(candles, dSetup.indicators),
      result: runBacktest(candles, strat, {}, dConfig),
      oos: oosStart !== null ? runBacktest(candles, strat, {}, dConfig, oosStart).metrics : null,
    }
  }, [candles, dSetup, dConfig, oosStart])

  const hasEntries = setup.entryLong.conditions.length + setup.entryShort.conditions.length > 0
  const loadedInfo =
    loaded && candles.length
      ? t.ws.loadedInfo(
          loaded.symbol,
          loaded.interval,
          candles.length,
          date(candles[0].time, t.locale),
          date(candles[candles.length - 1].time, t.locale),
        )
      : null
  const errorText =
    error?.kind === 'raw'
      ? error.message
      : error?.kind === 'tooFew'
        ? t.ws.tooFewBars(error.n, error.req.symbol, error.req.interval)
        : error
          ? t.ws.loadFailed
          : null

  return (
    <div className="ws">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="chart" size={18} />
          </span>
          QuantLab
        </div>
        <nav aria-label={t.ws.viewLabel}>
          <button type="button" className="btn btn-sm btn-ghost" aria-pressed={view === 'backtest'} onClick={() => setView('backtest')}>
            {t.ws.backtest}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" aria-pressed={view === 'compare'} onClick={() => setView('compare')}>
            {t.ws.compare}
          </button>
        </nav>
        <span className="spacer" />
        <LangSwitch />
        <span className="muted" style={{ fontSize: 13 }}>
          {user!.name}
        </span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={logout}>
          <Icon name="logout" /> {t.ws.logout}
        </button>
      </header>

      <div className="ws-body">
        <aside className="sidebar" aria-label={t.ws.settingsLabel}>
          <DataPanel value={request} onChange={setRequest} onLoad={load} loading={loading} loadedInfo={loadedInfo} />
          <SetupBuilder
            setup={setup}
            onChange={setSetup}
            presets={PRESETS}
            saved={saved}
            onSave={() => setSaved(saveSetup(email, { ...setup, name: setup.name.trim() }))}
            onDelete={(name) => setSaved(deleteSetup(email, name))}
          />
          <RiskPanel value={config} onChange={setConfig} oosPct={oosPct} onOosChange={setOosPct} />
        </aside>

        <main className="main">
          {errorText && (
            <div className="alert error" role="alert">
              {errorText}
            </div>
          )}
          {!computed && !errorText && (
            <div className="card empty">
              <span className="spinner" aria-hidden="true" />
              {t.ws.loadingData}
            </div>
          )}

          {computed && view === 'backtest' && (
            <>
              {!hasEntries && <div className="alert info">{t.ws.noEntries}</div>}
              <MetricsGrid m={computed.result.metrics} oos={computed.oos} oosPct={oosPct} />
              <section className="card chart-card" aria-labelledby="price-title">
                <div className="panel-head">
                  <h2 id="price-title">
                    {loaded?.symbol} · {loaded?.interval} — {dSetup.name}
                  </h2>
                </div>
                <div className="legend" aria-label={t.ws.legend}>
                  {legend.map((l) => (
                    <span key={l.label}>
                      <i style={{ background: l.color }} />
                      {l.label}
                    </span>
                  ))}
                </div>
                <PriceChart
                  candles={candles}
                  instances={dSetup.indicators}
                  series={computed.series}
                  trades={computed.result.trades}
                  onLegend={setLegend}
                />
              </section>
              <section className="card chart-card" aria-labelledby="eq-title">
                <div className="panel-head">
                  <h2 id="eq-title">{t.ws.equityTitle}</h2>
                  <div className="legend">
                    <span>
                      <i style={{ background: '#22c55e' }} />
                      {t.ws.strategy}
                    </span>
                    <span>
                      <i style={{ background: '#64748b' }} />
                      {t.ws.buyHold}
                    </span>
                  </div>
                </div>
                <EquityChart equity={computed.result.equity} />
              </section>
              <section className="card chart-card" aria-labelledby="tr-title">
                <div className="panel-head">
                  <h2 id="tr-title">{t.ws.tradesTitle(computed.result.trades.length)}</h2>
                </div>
                <TradesTable trades={computed.result.trades} />
              </section>
            </>
          )}

          {computed && view === 'compare' && (
            <ComparePanel
              candles={candles}
              config={dConfig}
              oosStart={oosStart}
              presets={PRESETS}
              saved={saved}
              onLoad={(s) => {
                setSetup(structuredClone(s))
                setView('backtest')
              }}
            />
          )}
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            {t.ws.disclaimer}
          </p>
        </main>
      </div>
    </div>
  )
}
