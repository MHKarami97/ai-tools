import type { Remote } from 'comlink'
import { wrap } from 'comlink'
import { openDB, type IDBPDatabase } from 'idb'
import type { SynthesisMode, VoiceReport } from '@/workers/protocol'
import type { TextSynthesis } from '@/lib/tts/engine'

const MODEL_DB = 'tts-models'
const MODEL_STORE = 'files'
const VOICE_DB = 'tts-voice-samples'
const VOICE_STORE = 'samples'

type WorkerApi = Remote<{
  init(progress?: (done: number, total: number) => void): Promise<void>
  registerVoice(id: string, samples: Float32Array): Promise<VoiceReport>
  phonemize(text: string, mode: SynthesisMode): Promise<string>
  synthesizeText(
    text: string,
    voiceId: string,
    mode: SynthesisMode,
    pace: number,
    onProgress?: (done: number, total: number) => void,
  ): Promise<TextSynthesis>
  synthesizePhonemes(phonemes: string, voiceId: string, pace: number): Promise<Float32Array>
}>

export class TtsClient {
  private worker: WorkerApi | null = null
  private dbPromise: Promise<IDBPDatabase> | null = null

  async init(): Promise<void> {
    if (this.worker) return
    const worker = new Worker(new URL('@/workers/tts.worker.ts', import.meta.url), { type: 'module' })
    this.worker = wrap<WorkerApi>(worker)
    await this.worker.init((done, total) => this.updateModelProgress(done, total))
  }

  private async db(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(MODEL_DB, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(MODEL_STORE)) {
            db.createObjectStore(MODEL_STORE)
          }
        },
      })
    }
    return this.dbPromise
  }

  private async voiceDb(): Promise<IDBPDatabase> {
    return openDB(VOICE_DB, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(VOICE_STORE)) {
          db.createObjectStore(VOICE_STORE)
        }
      },
    })
  }

  private async updateModelProgress(done: number, total: number): Promise<void> {
    const db = await this.db()
    const tx = db.transaction(MODEL_STORE, 'readwrite')
    await tx.store.put({ done, total }, 'progress')
    await tx.done
  }

  async getModelProgress(): Promise<{ done: number; total: number } | null> {
    const db = await this.db()
    return db.get(MODEL_STORE, 'progress')
  }

  async clearModelProgress(): Promise<void> {
    const db = await this.db()
    await db.delete(MODEL_STORE, 'progress')
  }

  async registerVoice(id: string, audioBuffer: AudioBuffer): Promise<VoiceReport> {
    if (!this.worker) throw new Error('کلاینت مقداردهی نشده است')
    const samples = audioBuffer.getChannelData(0)
    const report = await this.worker.registerVoice(id, samples)
    const vdb = await this.voiceDb()
    await vdb.put(VOICE_STORE, samples, id)
    return report
  }

  async getVoiceSamples(id: string): Promise<Float32Array | null> {
    const vdb = await this.voiceDb()
    return vdb.get(VOICE_STORE, id)
  }

  async phonemize(text: string, mode: SynthesisMode): Promise<string> {
    if (!this.worker) throw new Error('کلاینت مقداردهی نشده است')
    return this.worker.phonemize(text, mode)
  }

  async synthesizeText(
    text: string,
    voiceId: string,
    mode: SynthesisMode,
    pace: number,
    onProgress?: (done: number, total: number) => void,
  ): Promise<TextSynthesis> {
    if (!this.worker) throw new Error('کلاینت مقداردهی نشده است')
    return this.worker.synthesizeText(text, voiceId, mode, pace, onProgress)
  }

  async synthesizePhonemes(phonemes: string, voiceId: string, pace: number): Promise<Float32Array> {
    if (!this.worker) throw new Error('کلاینت مقداردهی نشده است')
    return this.worker.synthesizePhonemes(phonemes, voiceId, pace)
  }
}
