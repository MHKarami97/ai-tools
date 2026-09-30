export interface Mp3Request {
  readonly channels: Float32Array[]
  readonly sampleRate: number
  readonly kbps: number
}

export type Mp3Response =
  | { readonly type: 'progress'; readonly fraction: number }
  | { readonly type: 'done'; readonly blob: Blob }
  | { readonly type: 'error'; readonly message: string }
