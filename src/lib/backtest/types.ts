/** One OHLCV bar. `time` is a UNIX timestamp in seconds (bar open time, UTC). */
export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  /** Aggressive (taker) buy volume, when the source provides it (Binance does). */
  takerBuyVolume?: number
}

/** Desired position after a bar closes: 1 long, 0 flat, -1 short. */
export type Position = -1 | 0 | 1

export interface ParamDef {
  key: string
  label: string
  min: number
  max: number
  step: number
  default: number
}

export type StrategyParams = Record<string, number>

export interface Strategy {
  id: string
  name: string
  description: string
  params: ParamDef[]
  /** Returns the target position for every bar, decided on that bar's close. */
  targets: (candles: Candle[], params: StrategyParams) => Position[]
}

export interface BacktestConfig {
  initialCapital: number
  /** Fee per side, in basis points of traded notional. */
  feeBps: number
  /** Adverse slippage per fill, in basis points of price. */
  slippageBps: number
  allowShort: boolean
  /** Position notional as a multiple of equity (futures leverage, isolated, no funding). */
  leverage: number
  /** 0 disables. Percent from entry price. */
  stopLossPct: number
  /** 0 disables. Percent from entry price. */
  takeProfitPct: number
}

export type ExitReason = 'signal' | 'stop' | 'target' | 'liquidation' | 'end'

export interface Trade {
  side: 1 | -1
  entryTime: number
  entryPrice: number
  exitTime: number
  exitPrice: number
  /** Net profit in account currency, after fees. */
  pnl: number
  /** Net return of the trade, as a fraction (0.05 = +5%). */
  returnPct: number
  bars: number
  exitReason: ExitReason
}

export interface EquityPoint {
  time: number
  equity: number
  benchmark: number
}

export interface Metrics {
  totalReturn: number
  benchmarkReturn: number
  cagr: number
  maxDrawdown: number
  sharpe: number
  winRate: number
  profitFactor: number
  trades: number
  avgTradeReturn: number
  exposure: number
  finalEquity: number
}

export interface BacktestResult {
  trades: Trade[]
  equity: EquityPoint[]
  metrics: Metrics
}
