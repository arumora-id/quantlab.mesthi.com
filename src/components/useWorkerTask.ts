import { useEffect, useRef, useState } from 'react'
import { TaskRunner, type TaskState } from '../lib/taskRunner'

const createWorker = () => new Worker(new URL('../workers/backtest.worker.ts', import.meta.url), { type: 'module' })

/**
 * Runs `payload` on the backtest worker whenever it changes (by identity). Latest change wins; the
 * previous result stays available while a new one is computed. A null payload does nothing.
 */
export function useWorkerTask<P, R>(type: 'run' | 'compare', payload: P | null): TaskState<R, P> {
  const [state, setState] = useState<TaskState<R, P>>({ busy: false, result: null, source: null, progress: null, error: null })
  const runner = useRef<TaskRunner<P, R> | null>(null)

  useEffect(() => {
    const r = new TaskRunner<P, R>(type, createWorker, setState)
    runner.current = r
    return () => {
      r.dispose()
      runner.current = null
    }
  }, [type])

  useEffect(() => {
    if (payload !== null) runner.current?.run(payload)
  }, [payload])

  return state
}
