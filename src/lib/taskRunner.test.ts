import { describe, expect, it } from 'vitest'
import { computeCompare, computeRun } from './backtest/compute'
import { PRESETS } from './backtest/presets'
import { runSetup } from './backtest/runSetup'
import { syntheticCandles } from './backtest/sampleData'
import { TaskRunner, type TaskState, type WorkerLike } from './taskRunner'

class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  sent: { id: number; payload: unknown }[] = []
  terminated = false
  postMessage(m: { id: number; payload: unknown }) {
    this.sent.push(m)
  }
  terminate() {
    this.terminated = true
  }
  reply(data: unknown) {
    this.onmessage?.({ data } as MessageEvent)
  }
}

function setup() {
  const workers: FakeWorker[] = []
  const states: TaskState<string>[] = []
  const runner = new TaskRunner<number, string>(
    'run',
    () => {
      const w = new FakeWorker()
      workers.push(w)
      return w
    },
    (s) => states.push(s),
  )
  return { runner, workers, states }
}

describe('TaskRunner', () => {
  it('is busy until the worker answers, then keeps the result', () => {
    const { runner, workers, states } = setup()
    runner.run(1)
    expect(states.at(-1)).toMatchObject({ busy: true })
    workers[0].reply({ id: 1, kind: 'progress', done: 1, total: 2 })
    expect(states.at(-1)).toMatchObject({ busy: true, progress: { done: 1, total: 2 } })
    workers[0].reply({ id: 1, kind: 'done', result: 'A' })
    expect(states.at(-1)).toMatchObject({ busy: false, result: 'A', source: 1, progress: null })
  })

  it('cancels a running task when a newer one arrives (latest wins)', () => {
    const { runner, workers, states } = setup()
    runner.run(1)
    runner.run(2)
    expect(workers[0].terminated).toBe(true)
    expect(workers).toHaveLength(2)
    workers[0].reply({ id: 1, kind: 'done', result: 'old' }) // ignored: stale
    workers[1].reply({ id: 2, kind: 'done', result: 'new' })
    expect(states.at(-1)).toMatchObject({ busy: false, result: 'new', source: 2 })
    expect(states.some((s) => s.result === 'old')).toBe(false)
  })

  it('reuses an idle worker and keeps the previous result while busy', () => {
    const { runner, workers, states } = setup()
    runner.run(1)
    workers[0].reply({ id: 1, kind: 'done', result: 'A' })
    runner.run(2)
    expect(workers).toHaveLength(1)
    expect(states.at(-1)).toMatchObject({ busy: true, result: 'A' })
  })

  it('reports errors and stops being busy', () => {
    const { runner, workers, states } = setup()
    runner.run(1)
    workers[0].reply({ id: 1, kind: 'error', message: 'boom' })
    expect(states.at(-1)).toMatchObject({ busy: false, error: 'boom' })
  })
})

describe('compute', () => {
  const candles = syntheticCandles(400, 8)
  const config = { initialCapital: 10_000, feeBps: 5, slippageBps: 2, allowShort: true, leverage: 1, stopLossPct: 0, takeProfitPct: 0 }

  it('computeRun matches running the setup directly', () => {
    const setup = PRESETS.find((p) => p.name === 'EMA 20/50 Cross')!
    const r = computeRun({ candles, setup, config, oosStart: 280, htf: {} })
    expect(r.result.metrics).toEqual(runSetup(candles, setup, config).metrics)
    expect(r.oos).toEqual(runSetup(candles, setup, config, 280).metrics)
    expect(Object.keys(r.series)).toEqual(setup.indicators.map((i) => i.id))
  })

  it('computeCompare reports progress after every setup', () => {
    const setups = PRESETS.slice(0, 3).map((setup) => ({ setup, source: 'preset' as const }))
    const progress: number[] = []
    const rows = computeCompare({ candles, setups, config, oosStart: null, htf: {} }, (d) => progress.push(d))
    expect(rows).toHaveLength(3)
    expect(progress).toEqual([1, 2, 3])
  })
})
