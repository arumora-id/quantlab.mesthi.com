import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/context'
import { EquityChart, PriceChart, type LegendItem } from '../components/charts'
import { ComparePanel } from '../components/ComparePanel'
import { DataPanel, type DataRequest } from '../components/DataPanel'
import { Icon } from '../components/Icon'
import { LangSwitch } from '../components/LangSwitch'
import { ThemeToggle } from '../components/ThemeToggle'
import { MetricsGrid, TradesTable } from '../components/Results'
import { RiskPanel } from '../components/RiskPanel'
import { SetupBuilder } from '../components/SetupBuilder'
import { SimpleSidebar } from '../components/SimpleSidebar'
import { barsFor } from '../lib/simple'
import { SimpleSummary } from '../components/SimpleSummary'
import { useHtfData } from '../components/useHtfData'
import { BinanceUnreachableError, fetchFuturesKlines } from '../lib/backtest/binanceFutures'
import type { RunRequest, RunResult } from '../lib/backtest/compute'
import { StatusBar } from '../components/StatusBar'
import { useWorkerTask } from '../components/useWorkerTask'
import { PRESETS } from '../lib/backtest/presets'
import type { Setup } from '../lib/backtest/rules'
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
type Mode = 'simple' | 'pro'
const MODE_KEY = 'quantlab.mode'
const DEFAULT_DAYS = 1460

export default function Workspace() {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const email = user!.email
  const [view, setView] = useState<View>('backtest')
  const [mode, setModeState] = useState<Mode>(() => (localStorage.getItem(MODE_KEY) === 'pro' ? 'pro' : 'simple'))
  const setMode = (m: Mode) => {
    localStorage.setItem(MODE_KEY, m)
    setModeState(m)
  }
  const [periodDays, setPeriodDays] = useState(DEFAULT_DAYS)
  const [request, setRequest] = useState<DataRequest>({ symbol: 'BTCUSDT', interval: '1d', bars: barsFor('1d', DEFAULT_DAYS) })
  const [candles, setCandles] = useState<Candle[]>([])
  const [loaded, setLoaded] = useState<DataRequest | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number } | null>(null)
  /** Either a message from Binance, or a translatable local error. */
  const [error, setError] = useState<
    { kind: 'raw'; message: string } | { kind: 'tooFew'; n: number; req: DataRequest } | { kind: 'failed' } | { kind: 'unreachable' } | null
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
    setLoadProgress({ loaded: 0, total: req.bars })
    setError(null)
    try {
      const data = await fetchFuturesKlines(req.symbol, req.interval, req.bars, ctrl.signal, (loaded, total) => {
        if (!ctrl.signal.aborted) setLoadProgress({ loaded, total })
      })
      if (data.length < 50) {
        setError({ kind: 'tooFew', n: data.length, req })
        return
      }
      setCandles(data)
      setLoaded(req)
    } catch (e) {
      if (ctrl.signal.aborted) return
      if (e instanceof BinanceUnreachableError) setError({ kind: 'unreachable' })
      else setError(e instanceof Error ? { kind: 'raw', message: e.message } : { kind: 'failed' })
    } finally {
      if (!ctrl.signal.aborted) {
        setLoading(false)
        setLoadProgress(null)
      }
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
  const htfSetups = useMemo(() => [dSetup, ...PRESETS, ...saved], [dSetup, saved])
  const { htf, loading: htfLoading } = useHtfData(loaded?.symbol ?? null, candles, htfSetups)

  // the backtest runs on a Web Worker: the page stays responsive and shows progress while it computes
  const runPayload = useMemo<RunRequest | null>(
    () => (candles.length ? { candles, setup: dSetup, config: dConfig, oosStart, htf } : null),
    [candles, dSetup, dConfig, oosStart, htf],
  )
  const run = useWorkerTask<RunRequest, RunResult>('run', runPayload)
  const computed = run.result
  const shown = run.source // the exact inputs behind `computed`
  const busy = loading || htfLoading || run.busy
  const statusText = loading
    ? loadProgress && loadProgress.loaded > 0
      ? t.status.data(loadProgress.loaded.toLocaleString(t.locale), loadProgress.total.toLocaleString(t.locale))
      : t.status.dataStart
    : htfLoading
      ? t.status.htf
      : run.busy
        ? t.status.compute
        : null
  const statusProgress = loading && loadProgress ? loadProgress.loaded / loadProgress.total : null

  const hasEntries = !!setup.model || setup.entryLong.conditions.length + setup.entryShort.conditions.length > 0
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
      : error?.kind === 'unreachable'
        ? t.ws.unreachable
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
        <div className="segmented mode-switch" role="group" aria-label={t.simple.modeLabel}>
          {(['simple', 'pro'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {t.simple[m]}
            </button>
          ))}
        </div>
        <LangSwitch />
        <ThemeToggle />
        <span className="muted" style={{ fontSize: 13 }}>
          {user!.name}
        </span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={logout}>
          <Icon name="logout" /> {t.ws.logout}
        </button>
      </header>

      <div className="ws-body">
        <aside className="sidebar" aria-label={t.ws.settingsLabel}>
          {mode === 'simple' ? (
            <SimpleSidebar
              request={request}
              periodDays={periodDays}
              onData={(req, days) => {
                setRequest(req)
                setPeriodDays(days)
                load(req)
              }}
              loadedInfo={loadedInfo}
              setup={setup}
              presets={PRESETS}
              onPreset={(p) => setSetup(structuredClone(p))}
              config={config}
              onConfig={setConfig}
            />
          ) : (
            <>
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
            </>
          )}
        </aside>

        <main className="main">
          {errorText && (
            <div className="alert error error-row" role="alert">
              <span>{errorText}</span>
              <button type="button" className="btn btn-sm" onClick={() => load(request)} disabled={loading}>
                <Icon name="refresh" /> {t.ws.retry}
              </button>
            </div>
          )}
          {statusText && view === 'backtest' && <StatusBar text={statusText} progress={statusProgress} />}
          {run.error && <div className="alert error" role="alert">{t.status.failed(run.error)}</div>}

          {computed && shown && view === 'backtest' && (
            <div className={`results${busy ? ' stale' : ''}`} aria-busy={busy}>
              {!hasEntries && <div className="alert info">{t.ws.noEntries}</div>}
              {mode === 'simple' ? (
                <SimpleSummary result={computed.result} oos={computed.oos} oosPct={oosPct} capital={shown.config.initialCapital} />
              ) : (
                <MetricsGrid m={computed.result.metrics} oos={computed.oos} oosPct={oosPct} />
              )}
              <section className="card chart-card" aria-labelledby="price-title">
                <div className="panel-head">
                  <h2 id="price-title">
                    {loaded?.symbol} · {loaded?.interval} — {shown.setup.name}
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
                <small className="muted">{t.simple.markers}</small>
                <PriceChart
                  candles={shown.candles}
                  instances={shown.setup.indicators}
                  series={computed.series}
                  trades={computed.result.trades}
                  onLegend={setLegend}
                />
              </section>
              <section className="card chart-card" aria-labelledby="eq-title">
                <div className="panel-head">
                  <h2 id="eq-title">{mode === 'simple' ? t.simple.equityTitle : t.ws.equityTitle}</h2>
                  <div className="legend">
                    <span>
                      <i style={{ background: 'var(--color-up)' }} />
                      {t.ws.strategy}
                    </span>
                    <span>
                      <i style={{ background: 'var(--chart-bench)' }} />
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
                {mode === 'simple' ? (
                  <details>
                    <summary className="btn btn-sm btn-ghost">{t.simple.showTrades(computed.result.trades.length)}</summary>
                    <TradesTable trades={computed.result.trades} />
                  </details>
                ) : (
                  <TradesTable trades={computed.result.trades} />
                )}
              </section>
            </div>
          )}

          {candles.length > 0 && view === 'compare' && (
            <ComparePanel
              candles={candles}
              htf={htf}
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
