import type { SplitterInput, SplitterMessage } from './types'

export interface SplitterProgressState {
  type: 'model' | 'process'
  loaded?: number
  total?: number
  progress?: number
  currentSegment?: number
  totalSegments?: number
  message?: string
}

export interface SplitterResult {
  sampleRate: number
  vocalsLeft: Float32Array
  vocalsRight: Float32Array
  instrumentalLeft: Float32Array
  instrumentalRight: Float32Array
}

export class SplitterClient {
  private worker: Worker | null = null
  private abortController: AbortController | null = null
  private onProgressCallback: ((state: SplitterProgressState) => void) | null = null
  private result: SplitterResult | null = null

  constructor(private workerUrl: string) {}

  set onProgress(cb: (state: SplitterProgressState) => void) {
    this.onProgressCallback = cb
  }

  async separate(left: Float32Array, right: Float32Array): Promise<SplitterResult> {
    this.abortController = new AbortController()
    this.result = null
    this.worker = new Worker(this.workerUrl, { type: 'module' })
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        if (this.worker) {
          this.worker.terminate()
          this.worker = null
        }
      }
      const handleMessage = (event: MessageEvent<SplitterMessage>) => {
        const data = event.data
        if (!data) return
        if (data.type === 'model-progress' && this.onProgressCallback) {
          this.onProgressCallback({
            type: 'model',
            loaded: data.loaded,
            total: data.total,
          })
        } else if (data.type === 'model-cached' && this.onProgressCallback) {
          this.onProgressCallback({
            type: 'model',
            loaded: data.bytes,
            total: data.bytes,
            message: 'مدل از کش خوانده شد',
          })
        } else if ((data.type === 'status' || data.type === 'log') && this.onProgressCallback) {
          this.onProgressCallback({ type: 'process', message: data.message })
        } else if (data.type === 'progress' && this.onProgressCallback) {
          this.onProgressCallback({
            type: 'process',
            progress: data.progress,
            currentSegment: data.currentSegment,
            totalSegments: data.totalSegments,
          })
        } else if (data.type === 'done') {
          this.result = {
            sampleRate: data.sampleRate,
            vocalsLeft: new Float32Array(data.vocalsLeft),
            vocalsRight: new Float32Array(data.vocalsRight),
            instrumentalLeft: new Float32Array(data.instrumentalLeft),
            instrumentalRight: new Float32Array(data.instrumentalRight),
          }
          cleanup()
          resolve(this.result)
        } else if (data.type === 'error') {
          cleanup()
          reject(new Error(data.message))
        }
      }
      this.worker?.addEventListener('message', handleMessage)
      this.worker?.addEventListener('error', (error) => {
        cleanup()
        reject(error)
      })
      const input: SplitterInput = { type: 'separate', left: left.buffer, right: right.buffer }
      this.worker?.postMessage(input, [left.buffer, right.buffer] as unknown as WindowPostMessageOptions)
    })
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }

  getResult(): SplitterResult | null {
    return this.result
  }
}

export function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): Blob {
  const frames = Math.min(left.length, right.length)
  const buffer = new ArrayBuffer(44 + frames * 4)
  const view = new DataView(buffer)
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + frames * 4, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 2, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 4, true)
  view.setUint16(32, 4, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, frames * 4, true)
  let offset = 44
  for (let i = 0; i < frames; i += 1) {
    const l = Math.max(-1, Math.min(1, left[i] || 0))
    const r = Math.max(-1, Math.min(1, right[i] || 0))
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true)
    view.setInt16(offset + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true)
    offset += 4
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function baseName(name: string): string {
  return name.replace(/\.[^/.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_') || 'track'
}