export type Backend = 'webgpu' | 'wasm'
export type BackendPreference = 'auto' | 'wasm'
export type SynthesisMode = 'split' | 'pack'

export interface RuntimeInfo {
  readonly backend: Backend
  readonly crossOriginIsolated: boolean
  readonly hardwareConcurrency: number
}

export interface SynthesisResult {
  readonly samples: Float32Array
  readonly sampleRate: number
  readonly phonemes: string
  readonly sentences: number
}

export interface VoiceReport {
  readonly seconds: number
  readonly droppedMs: number
}

export interface TtsRequestMap {
  init: { model: 'dummy' | 'persian'; backend: BackendPreference }
  setVoice: { id: string; samples: Float32Array }
  synthesize: { text: string; voiceId: string; mode: SynthesisMode; pace: number }
  synthesizePhonemes: { phonemes: string; voiceId: string; pace: number }
  phonemize: { text: string; mode: SynthesisMode }
}

export type TtsRequestType = keyof TtsRequestMap

export type TtsRequest = {
  [K in TtsRequestType]: { id: number; type: K; payload: TtsRequestMap[K] }
}[TtsRequestType]

export interface TtsResponseMap {
  ready: RuntimeInfo
  voiceReady: VoiceReport
  result: SynthesisResult
  phonemes: { phonemes: string }
  status: { message: string }
  progress: { done: number; total: number }
  error: { message: string }
}

export type TtsResponse = {
  [K in keyof TtsResponseMap]: { id: number; type: K; payload: TtsResponseMap[K] }
}[keyof TtsResponseMap]

export interface WorkerScope {
  onmessage: ((event: MessageEvent<TtsRequest>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}
