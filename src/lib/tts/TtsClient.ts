import type { RuntimeInfo, SynthesisResult, TtsRequest, TtsResponse } from '@/workers/protocol'

interface PendingRequest {
  resolve(payload: never): void
  reject(error: Error): void
}

export class TtsClient {
  private worker: Worker | null = null
  private nextId = 1
  private readonly pending = new Map<number, PendingRequest>()

  init(): Promise<RuntimeInfo> {
    return this.send<RuntimeInfo>('init', { model: 'dummy' })
  }

  synthesize(text: string): Promise<SynthesisResult> {
    return this.send<SynthesisResult>('synthesize', { text })
  }

  terminate(): void {
    this.worker?.terminate()
    this.worker = null
    this.rejectAll(new Error('Worker terminated.'))
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('../../workers/tts.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<TtsResponse>) => this.handleResponse(event.data)
    worker.onerror = (event) => this.rejectAll(new Error(event.message || 'Worker crashed.'))
    this.worker = worker
    return worker
  }

  private send<T>(type: TtsRequest['type'], payload: unknown): Promise<T> {
    const id = this.nextId++
    const worker = this.ensureWorker()
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (payload: never) => void, reject })
      worker.postMessage({ id, type, payload } as TtsRequest)
    })
  }

  private handleResponse(response: TtsResponse): void {
    const request = this.pending.get(response.id)
    if (!request) return
    this.pending.delete(response.id)
    if (response.type === 'error') request.reject(new Error(response.payload.message))
    else request.resolve(response.payload as never)
  }

  private rejectAll(error: Error): void {
    this.pending.forEach((request) => request.reject(error))
    this.pending.clear()
  }
}
