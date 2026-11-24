import { INDICATOR_BY_ID, source, type Source } from './catalog'
import { baseSeconds, htfContext, mapToBase, TIMEFRAMES, type HtfData, type IndicatorTf } from './timeframe'
import type { Interval } from './binanceFutures'
import type { FabioParams } from './fabioProxy'
import type { TrendEnsembleParams } from './trendEnsemble'
import type { Candle, Position, Strategy } from './types'

/** One configured indicator in a setup, e.g. EMA(200) as "ema1". */
export interface IndicatorInstance {
  id: string
  defId: string
  params: Record<string, number>
  /** Compute on a higher timeframe (e.g. weekly trend filter on daily candles). Default: the chart. */
  tf?: IndicatorTf
}

export type Operand =
  | { kind: 'price'; field: Source | 'volume' }
  | { kind: 'indicator'; instanceId: string; output: string }
  | { kind: 'number'; value: number }

export type Operator = '>' | '<' | 'crossesAbove' | 'crossesBelow'

export interface Condition {
  left: Operand
  op: Operator
  right: Operand
}

export interface RuleGroup {
  mode: 'all' | 'any'
  conditions: Condition[]
}

/** Built-in models that size and exit their own positions. */
export type SetupModel =
  | ({ kind: 'trendEnsemble'; rebalanceBand: number } & TrendEnsembleParams)
  | ({ kind: 'fabioProxy' } & FabioParams)

export interface Setup {
  name: string
  indicators: IndicatorInstance[]
  entryLong: RuleGroup
  exitLong: RuleGroup
  entryShort: RuleGroup
  exitShort: RuleGroup
  /** A built-in sized model replaces the rules (the rule groups are then ignored). */
  model?: SetupModel
  /** Chart timeframe the setup is designed for; Simple mode switches to it when the setup is picked. */
  preferredInterval?: Interval
  /** Shown with a "research" badge: evidence for the exact rules is weak or still being tested. */
  research?: boolean
}

export function instanceLabel(inst: IndicatorInstance) {
  const def = INDICATOR_BY_ID[inst.defId]
  const args = def?.params
    .filter((p) => p.key !== 'source')
    .map((p) => inst.params[p.key])
    .join(',')
  const tf = inst.tf && inst.tf !== 'chart' ? ` [${inst.tf}]` : ''
  return `${def?.name ?? inst.defId}${args ? `(${args})` : ''}${tf}`
}

export const emptyGroup = (): RuleGroup => ({ mode: 'all', conditions: [] })

export type SeriesMap = Record<string, Record<string, number[]>>

/** Computes every indicator instance once: `out[instanceId][output]`. */
export function computeIndicators(candles: Candle[], instances: IndicatorInstance[], htf?: HtfData): SeriesMap {
  const out: SeriesMap = {}
  const base = baseSeconds(candles)
  const ctx = htfContext(candles, htf)
  for (const inst of instances) {
    const def = INDICATOR_BY_ID[inst.defId]
    if (!def) continue
    const tfSec = inst.tf && inst.tf !== 'chart' ? TIMEFRAMES[inst.tf] : 0
    if (tfSec <= base) {
      out[inst.id] = def.compute(candles, inst.params, ctx)
      continue
    }
    const r = ctx.htf(tfSec)
    out[inst.id] = mapToBase(def.compute(r.bars, inst.params, htfContext(r.bars)), r.visible)
  }
  return out
}

/** Higher timeframes (in seconds, above the chart's) that these setups read: worth fetching from Binance. */
export function neededTimeframes(setups: Setup[], chartSeconds: number): number[] {
  const tfs = new Set<number>()
  for (const s of setups)
    for (const inst of s.indicators) {
      if (inst.tf && inst.tf !== 'chart') tfs.add(TIMEFRAMES[inst.tf])
      for (const tf of INDICATOR_BY_ID[inst.defId]?.needsTf ?? []) tfs.add(TIMEFRAMES[tf])
    }
  return [...tfs].filter((t) => t > chartSeconds).sort((a, b) => a - b)
}

function resolve(op: Operand, candles: Candle[], series: SeriesMap): number[] {
  switch (op.kind) {
    case 'number':
      return candles.map(() => op.value)
    case 'price':
      return op.field === 'volume' ? candles.map((c) => c.volume) : source(candles, op.field)
    case 'indicator':
      return series[op.instanceId]?.[op.output] ?? candles.map(() => NaN)
  }
}

/** Per-bar truth of a group. An empty group is never true. NaN comparisons are false. */
export function evaluateGroup(group: RuleGroup, candles: Candle[], series: SeriesMap): boolean[] {
  if (!group.conditions.length) return candles.map(() => false)
  const results = group.conditions.map((cond) => {
    const a = resolve(cond.left, candles, series)
    const b = resolve(cond.right, candles, series)
    return candles.map((_, i) => {
      switch (cond.op) {
        case '>':
          return a[i] > b[i]
        case '<':
          return a[i] < b[i]
        case 'crossesAbove':
          return i > 0 && a[i - 1] <= b[i - 1] && a[i] > b[i]
        case 'crossesBelow':
          return i > 0 && a[i - 1] >= b[i - 1] && a[i] < b[i]
      }
    })
  })
  return candles.map((_, i) =>
    group.mode === 'all' ? results.every((r) => r[i]) : results.some((r) => r[i]),
  )
}

/**
 * Turns a setup into a strategy. Per bar, from flat: long entry wins over short entry.
 * In a position: an exit signal or an opposite entry closes it; an opposite entry also reverses.
 */
export function setupToStrategy(setup: Setup, htf?: HtfData): Strategy {
  return {
    id: `setup:${setup.name}`,
    name: setup.name,
    description: '',
    params: [],
    targets(candles) {
      const series = computeIndicators(candles, setup.indicators, htf)
      const eL = evaluateGroup(setup.entryLong, candles, series)
      const xL = evaluateGroup(setup.exitLong, candles, series)
      const eS = evaluateGroup(setup.entryShort, candles, series)
      const xS = evaluateGroup(setup.exitShort, candles, series)
      let pos: Position = 0
      return candles.map((_, i) => {
        if (pos === 1 && (xL[i] || eS[i])) pos = eS[i] ? -1 : 0
        else if (pos === -1 && (xS[i] || eL[i])) pos = eL[i] ? 1 : 0
        else if (pos === 0) pos = eL[i] ? 1 : eS[i] ? -1 : 0
        return pos
      })
    },
  }
}
