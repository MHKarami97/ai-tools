import { configureOrt, createSession, ort, type SessionHandle } from '@/lib/ort/runtime'
import { buildDummyTtsModel, DUMMY_SAMPLE_RATE } from '@/lib/ort/dummyTtsModel'
import type { RuntimeInfo, SynthesisResult, TtsRequest, TtsResponse, WorkerScope } from './protocol'

const scope = self as unknown as WorkerScope

class TtsEngine {
  private handle: SessionHandle | null = null

  async init(): Promise<RuntimeInfo> {
    if (!this.handle) {
      configureOrt()
      this.handle = await createSession(buildDummyTtsModel())
    }
    return {
      backend: this.handle.backend,
      crossOriginIsolated: self.crossOriginIsolated,
      hardwareConcurrency: navigator.hardwareConcurrency,
    }
  }

  async synthesize(text: string): Promise<SynthesisResult> {
    if (!this.handle) throw new Error('Engine is not initialized.')
    const codePoints = Array.from(text, (char) => char.codePointAt(0) ?? 0)
    const freq = Float32Array.from(codePoints, (codePoint) => 220 + (codePoint % 40) * 12)
    const input = new ort.Tensor('float32', freq, [1, freq.length, 1])
    const output = await this.handle.session.run({ freq: input })
    return { samples: new Float32Array(output.audio.data as Float32Array), sampleRate: DUMMY_SAMPLE_RATE }
  }
}

const engine = new TtsEngine()

function reply(response: TtsResponse, transfer: Transferable[] = []): void {
  scope.postMessage(response, transfer)
}

async function handle(request: TtsRequest): Promise<void> {
  try {
    if (request.type === 'init') {
      reply({ id: request.id, type: 'ready', payload: await engine.init() })
      return
    }
    const result = await engine.synthesize(request.payload.text)
    reply({ id: request.id, type: 'result', payload: result }, [result.samples.buffer])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    reply({ id: request.id, type: 'error', payload: { message } })
  }
}

scope.onmessage = (event) => {
  void handle(event.data)
}
