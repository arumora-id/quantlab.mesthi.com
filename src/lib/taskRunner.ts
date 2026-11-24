/** The part of a Web Worker the runner uses (so tests can pass a fake). */
export interface WorkerLike {
  postMessage(message: unknown): void
  terminate(): void
  onmessage: ((e: MessageEvent) => void) | null
  onerror: ((e: ErrorEvent) => void) | null
}

export interface TaskState<R, P = unknown> {
  busy: boolean
  /** Latest finished result; kept while a newer task runs so the screen does not go blank. */
  result: R | null
  /** The input that produced `result` (so a view never mixes new data with an old result). */
  source: P | null
  progress: { done: number; total: number } | null
  error: string | null
}

/**
 * Runs one task type on a worker, latest request wins: a new request while one is running terminates
 * the worker (the old computation stops at once) and starts a fresh one.
 */
export class TaskRunner<P, R> {
  private worker: WorkerLike | null = null
  private id = 0
  private running = false
  private input: P | null = null
  private state: TaskState<R, P> = { busy: false, result: null, source: null, progress: null, error: null }

  private readonly type: string
  private readonly createWorker: () => WorkerLike
  private readonly onChange: (s: TaskState<R, P>) => void

  constructor(type: string, createWorker: () => WorkerLike, onChange: (s: TaskState<R, P>) => void) {
    this.type = type
    this.createWorker = createWorker
    this.onChange = onChange
  }

  private set(patch: Partial<TaskState<R, P>>) {
    this.state = { ...this.state, ...patch }
    this.onChange(this.state)
  }

  run(payload: P) {
    if (this.running && this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    if (!this.worker) {
      const w = this.createWorker()
      w.onmessage = (e) => this.receive(e.data)
      w.onerror = (e) => {
        this.running = false
        this.set({ busy: false, progress: null, error: e.message || 'Worker error' })
      }
      this.worker = w
    }
    const id = ++this.id
    this.input = payload
    this.running = true
    this.set({ busy: true, progress: null, error: null })
    this.worker.postMessage({ id, type: this.type, payload })
  }

  private receive(m: { id: number; kind: string; done?: number; total?: number; result?: R; message?: string }) {
    if (m.id !== this.id) return // a stale answer from a replaced request
    if (m.kind === 'progress') this.set({ progress: { done: m.done!, total: m.total! } })
    else if (m.kind === 'done') {
      this.running = false
      this.set({ busy: false, progress: null, result: m.result!, source: this.input, error: null })
    } else if (m.kind === 'error') {
      this.running = false
      this.set({ busy: false, progress: null, error: m.message ?? 'Error' })
    }
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    this.running = false
  }
}
