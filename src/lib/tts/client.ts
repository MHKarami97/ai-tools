import { proxy, wrap, type Remote } from 'comlink'
import { openDB, type IDBPDatabase } from 'idb'
import type { SynthesisMode, VoiceReport } from '@/workers/protocol'
import type { TextSynthesis } from '@/lib/tts/engine'

const VOICE_DB = 'tts-voice-samples'
const VOICE_STORE = 'samples'
const NOT_INITIALISED = 'کلاینت مقداردهی نشده است'

type ProgressCallback = (done: number, total: number) => void

interface WorkerApi {
  init(): Promise<void>
  registerVoice(id: string, samples: Float32Array): Promise<VoiceReport>
  phonemize(text: string, mode: SynthesisMode): Promise<string>
  synthesizeText(
    text: string,
    voiceId: string,
    mode: SynthesisMode,
    pace: number,
    onProgress?: ProgressCallback,
  ): Promise<TextSynthesis>
  synthesizePhonemes(phonemes: string, voiceId: string, pace: number): Promise<Float32Array>
}

export class TtsClient {
  private worker: Worker | null = null
  private api: Remote<WorkerApi> | null = null
  private voiceDbPromise: Promise<IDBPDatabase> | null = null

  async init(): Promise<void> {
    if (this.api) return
    const worker = new Worker(new URL('../../workers/tts.worker.ts', import.meta.url), { type: 'module' })
    const api = wrap<WorkerApi>(worker)
    try {
      await api.init()
    } catch (error) {
      worker.terminate()
      throw error
    }
    this.worker = worker
    this.api = api
  }

  terminate(): void {
    this.worker?.terminate()
    this.worker = null
    this.api = null
  }

  async registerVoice(id: string, samples: Float32Array): Promise<VoiceReport> {
    const report = await this.requireApi().registerVoice(id, samples)
    const database = await this.voiceDb()
    await database.put(VOICE_STORE, samples, id)
    return report
  }

  async hasSavedVoice(id: string): Promise<boolean> {
    const database = await this.voiceDb()
    return (await database.getKey(VOICE_STORE, id)) !== undefined
  }

  async restoreVoice(id: string): Promise<VoiceReport | null> {
    const database = await this.voiceDb()
    const samples: Float32Array | undefined = await database.get(VOICE_STORE, id)
    return samples ? this.requireApi().registerVoice(id, samples) : null
  }

  phonemize(text: string, mode: SynthesisMode): Promise<string> {
    return this.requireApi().phonemize(text, mode)
  }

  synthesizeText(
    text: string,
    voiceId: string,
    mode: SynthesisMode,
    pace: number,
    onProgress?: ProgressCallback,
  ): Promise<TextSynthesis> {
    return this.requireApi().synthesizeText(text, voiceId, mode, pace, onProgress ? proxy(onProgress) : undefined)
  }

  synthesizePhonemes(phonemes: string, voiceId: string, pace: number): Promise<Float32Array> {
    return this.requireApi().synthesizePhonemes(phonemes, voiceId, pace)
  }

  private requireApi(): Remote<WorkerApi> {
    if (!this.api) throw new Error(NOT_INITIALISED)
    return this.api
  }

  private voiceDb(): Promise<IDBPDatabase> {
    this.voiceDbPromise ??= openDB(VOICE_DB, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(VOICE_STORE)) {
          database.createObjectStore(VOICE_STORE)
        }
      },
    })
    return this.voiceDbPromise
  }
}
