import { computeCompare, computeRun, type CompareRequest, type RunRequest } from '../lib/backtest/compute'

export type WorkerRequest =
  | { id: number; type: 'run'; payload: RunRequest }
  | { id: number; type: 'compare'; payload: CompareRequest }

export type WorkerResponse =
  | { id: number; kind: 'progress'; done: number; total: number }
  | { id: number; kind: 'done'; result: unknown }
  | { id: number; kind: 'error'; message: string }

const post = (m: WorkerResponse) => (self as unknown as { postMessage(m: unknown): void }).postMessage(m)

self.addEventListener('message', (e: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = e.data
  try {
    const result =
      type === 'run'
        ? computeRun(payload)
        : computeCompare(payload, (done, total) => post({ id, kind: 'progress', done, total }))
    post({ id, kind: 'done', result })
  } catch (err) {
    post({ id, kind: 'error', message: err instanceof Error ? err.message : String(err) })
  }
})
