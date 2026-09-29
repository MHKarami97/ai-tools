declare module 'demucs-web' {
  export const CONSTANTS: {
    DEFAULT_MODEL_URL: string
    SAMPLE_RATE: number
  }
  export class DemucsProcessor {
    constructor(options: {
      ort: any
      modelPath: string
      sessionOptions: any
      onProgress?: (info: { progress: number; currentSegment?: number; totalSegments?: number }) => void
      onLog?: (phase: string, message: string) => void
    })
    loadModel(buffer: ArrayBuffer | { buffer: ArrayBuffer }): Promise<void>
    separate(left: Float32Array, right: Float32Array): Promise<{
      vocals: { left: Float32Array; right: Float32Array }
      drums: { left: Float32Array; right: Float32Array }
      bass: { left: Float32Array; right: Float32Array }
      other: { left: Float32Array; right: Float32Array }
    }>
  }
}