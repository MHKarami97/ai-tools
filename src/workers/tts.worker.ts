import { expose } from 'comlink'
import { ort } from '@/lib/ort/runtime'
import { loadNpz, type NpyArray } from '@/lib/npz'
import { PocketTtsEngine, type EngineAssets, type EngineConstants, type TextSynthesis } from '@/lib/tts/engine'
import type { SynthesisMode, VoiceReport } from './protocol'

interface ModelBundle {
  readonly constants: EngineConstants
  readonly flow: ort.InferenceSession
  readonly encoder: ort.InferenceSession
  readonly decoder: ort.InferenceSession
  readonly weights: Map<string, NpyArray>
  readonly decoderInit: Map<string, NpyArray>
}

let engine: PocketTtsEngine | null = null
let modelBundle: ModelBundle | null = null

async function loadModel(progress?: (done: number, total: number) => void): Promise<void> {
  if (modelBundle) return
  const [constants, flow, encoder, decoder, weights, decoderInit] = await Promise.all([
    fetch('/models/tts/constants.json').then((r) => r.json() as Promise<EngineConstants>),
    ort.InferenceSession.create('/models/tts/flow.onnx'),
    ort.InferenceSession.create('/models/tts/encoder.onnx'),
    ort.InferenceSession.create('/models/tts/decoder.onnx'),
    loadNpz('/models/tts/weights.npz', progress),
    loadNpz('/models/tts/decode_state_init.npz'),
  ])
  const sp = await ort.InferenceSession.create('/models/tts/sp.onnx').then((session) => ({
    encode: async (text: string) => {
      const input = new ort.Tensor('string', [text], [1])
      const { ids } = await session.run({ input })
      return Array.from(ids.data as BigInt64Array).map((n) => Number(n))
    },
  }))
  const g2p = await ort.InferenceSession.create('/models/tts/g2p.onnx').then((session) => ({
    convert: async (text: string) => {
      const input = new ort.Tensor('string', [text], [1])
      const { phonemes } = await session.run({ input })
      return (phonemes.data as string[])[0]
    },
  }))
  modelBundle = { constants, flow, encoder, decoder, weights, decoderInit }
  engine = new PocketTtsEngine({
    constants,
    flow,
    encoder,
    decoder,
    weights,
    decoderInit,
    sp,
    g2p,
  })
}

const handlers = {
  async init(progress?: (done: number, total: number) => void): Promise<void> {
    await loadModel(progress)
  },

  async registerVoice(id: string, samples: Float32Array): Promise<VoiceReport> {
    if (!engine) throw new Error('مدل بارگذاری نشده است')
    return engine.registerVoice(id, samples)
  },

  async phonemize(text: string, mode: SynthesisMode): Promise<string> {
    if (!engine) throw new Error('مدل بارگذاری نشده است')
    return engine.phonemize(text, mode)
  },

  async synthesizeText(
    text: string,
    voiceId: string,
    mode: SynthesisMode,
    pace: number,
    onProgress?: (done: number, total: number) => void,
  ): Promise<TextSynthesis> {
    if (!engine) throw new Error('مدل بارگذاری نشده است')
    return engine.synthesizeText(text, voiceId, mode, pace, onProgress)
  },

  async synthesizePhonemes(phonemes: string, voiceId: string, pace: number): Promise<Float32Array> {
    if (!engine) throw new Error('مدل بارگذاری نشده است')
    return engine.synthesizePhonemes(phonemes, voiceId, pace)
  },
}

expose(handlers)
