import * as ort from 'onnxruntime-web/webgpu'
import { DemucsProcessor, CONSTANTS } from 'demucs-web'
import { cacheModel, getCachedModel, MODEL_CACHE_KEY } from '@/lib/splitter/modelCache'
import type { SplitterInput, SplitterMessage } from '@/lib/splitter/types'

const MODEL_URL = CONSTANTS.DEFAULT_MODEL_URL
ort.env.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort/`
ort.env.wasm.numThreads = 1
ort.env.wasm.proxy = false

let processor: DemucsProcessor | null = null
let loadingPromise: Promise<DemucsProcessor> | null = null

function send(message: SplitterMessage, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}

async function fetchModelBuffer(): Promise<ArrayBuffer> {
  const cached = await getCachedModel()
  if (cached) {
    send({ type: 'model-cached', bytes: cached.byteLength } as SplitterMessage)
    return cached
  }
  const response = await fetch(MODEL_URL)
  if (!response.ok) throw new Error(`دانلود مدل ناموفق بود: HTTP ${response.status}`)
  const total = Number(response.headers.get('content-length')) || 0
  if (!response.body) {
    const buffer = await response.arrayBuffer()
    send({ type: 'model-progress', loaded: buffer.byteLength, total: total || buffer.byteLength })
    await cacheModel(buffer)
    return buffer
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(value)
    loaded += value.byteLength
    send({ type: 'model-progress', loaded, total })
  }
  const combined = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }
  const buffer = combined.buffer
  await cacheModel(buffer)
  return buffer
}

async function ensureModel(): Promise<DemucsProcessor> {
  if (processor) return processor
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    const instance = new DemucsProcessor({
      ort,
      modelPath: MODEL_URL,
      sessionOptions: {
        executionProviders: ['webgpu', 'wasm'],
        graphOptimizationLevel: 'basic',
        enableCpuMemArena: false,
        enableMemPattern: false,
      },
      onProgress: ({ progress, currentSegment, totalSegments }) => {
        send({ type: 'progress', progress, currentSegment, totalSegments })
      },
      onLog: (phase, message) => send({ type: 'log', phase, message }),
    })
    const modelBuffer = await fetchModelBuffer()
    send({ type: 'status', message: 'مدل در حال آماده‌سازی است…' })
    const blobUrl = URL.createObjectURL(new Blob([modelBuffer]))
    try {
      await instance.loadModel(modelBuffer)
    } finally {
      URL.revokeObjectURL(blobUrl)
    }
    processor = instance
    return instance
  })()
  try {
    return await loadingPromise
  } finally {
    loadingPromise = null
  }
}

function addInto(target: Float32Array, source: Float32Array): void {
  for (let i = 0; i < target.length; i += 1) target[i] += source[i] || 0
}

function makeInstrumental(result: any, length: number) {
  const left = new Float32Array(length)
  const right = new Float32Array(length)
  addInto(left, result.drums.left)
  addInto(left, result.bass.left)
  addInto(left, result.other.left)
  addInto(right, result.drums.right)
  addInto(right, result.bass.right)
  addInto(right, result.other.right)
  return { left, right }
}

self.onmessage = async (event: MessageEvent<SplitterInput>) => {
  if (event.data?.type !== 'separate') return
  try {
    const left = new Float32Array(event.data.left)
    const right = new Float32Array(event.data.right)
    const model = await ensureModel()
    send({ type: 'status', message: 'در حال جداسازی قطعه‌های صوتی…' })
    const result = await model.separate(left, right)
    const instrumental = makeInstrumental(result, left.length)
    const transfer = [
      result.vocals.left.buffer,
      result.vocals.right.buffer,
      instrumental.left.buffer,
      instrumental.right.buffer,
    ] as Transferable[]
    send(
      {
        type: 'done',
        sampleRate: CONSTANTS.SAMPLE_RATE,
        vocalsLeft: result.vocals.left.buffer,
        vocalsRight: result.vocals.right.buffer,
        instrumentalLeft: instrumental.left.buffer,
        instrumentalRight: instrumental.right.buffer,
      },
      transfer,
    )
  } catch (error) {
    send({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
}

export const SPLITTER_MODEL_CACHE_KEY = MODEL_CACHE_KEY
