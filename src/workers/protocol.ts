export type Backend = 'webgpu' | 'wasm'

export interface RuntimeInfo {
  readonly backend: Backend
  readonly crossOriginIsolated: boolean
  readonly hardwareConcurrency: number
}

export interface SynthesisResult {
  readonly samples: Float32Array
  readonly sampleRate: number
}

export type TtsRequest =
  | { id: number; type: 'init'; payload: { model: 'dummy' } }
  | { id: number; type: 'synthesize'; payload: { text: string } }

export type TtsResponse =
  | { id: number; type: 'ready'; payload: RuntimeInfo }
  | { id: number; type: 'result'; payload: SynthesisResult }
  | { id: number; type: 'error'; payload: { message: string } }

export interface WorkerScope {
  onmessage: ((event: MessageEvent<TtsRequest>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}
