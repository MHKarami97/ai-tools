import { ort } from '@/lib/ort/runtime'
import type { NpyArray } from '@/lib/npz'
import { Rng } from '@/lib/rng'
import type { SynthesisMode, VoiceReport } from '@/workers/protocol'
import {
  compressPauses,
  concatFloat32,
  deadAirRegions,
  rms,
  solidFraction,
  speechBounds,
  stitch,
  timeStretch,
  trimHotOnset,
  type Segment,
} from './audioDsp'
import { PhonemeChunker } from './chunker'
import type { OnnxG2P } from './g2p'
import { MAX_PACE, MAX_PHONEME_CHARS, MAX_TEXT_CHARS, MIN_PACE } from './limits'
import { NormalizationError } from './normalizeFa'
import type { SentencePieceModel } from './sentencepiece'
import {
  CHUNK_GAP,
  PHRASE_GAP,
  SENTENCE_GAP,
  TextPlanner,
  packPhrases,
  splitSentences,
  type PlanItem,
} from './textPlanner'

export interface EngineConstants {
  readonly ldim: number
  readonly dim: number
  readonly layers: number
  readonly heads: number
  readonly dim_per_head: number
  readonly cache_capacity: number
  readonly sample_rate: number
  readonly mimi_steps_per_latent: number
  readonly temp: number
  readonly tokens_per_second_estimate: number
  readonly gen_seconds_padding: number
  readonly frame_rate: number
}

export interface EngineAssets {
  readonly constants: EngineConstants
  readonly flow: ort.InferenceSession
  readonly encoder: ort.InferenceSession
  readonly decoder: ort.InferenceSession
  readonly weights: ReadonlyMap<string, NpyArray>
  readonly decoderInit: ReadonlyMap<string, NpyArray>
  readonly sp: SimpleSentencePiece
  readonly g2p: SimpleG2P
}

export interface TextSynthesis {
  readonly audio: Float32Array
  readonly phonemes: string
  readonly sentences: number
}

interface PreparedVoice {
  readonly cache: Float32Array
  readonly offset: number
  readonly droppedMs: number
}

interface FlowResult {
  readonly latent: Float32Array
  readonly eos: number
  readonly offset: number
}

export interface SimpleSentencePiece {
  encode: (text: string) => Promise<number[]>
}

export interface SimpleG2P {
  convert: (text: string) => Promise<string>
}

type TensorConstructor = new (type: string, data: unknown, dims: readonly number[]) => ort.Tensor
const DynamicTensor = ort.Tensor as unknown as TensorConstructor
const TENSOR_TYPES: Record<string, string> = {
  '<f4': 'float32',
  '<f8': 'float64',
  '<i4': 'int32',
  '<i8': 'int64',
  '|b1': 'bool',
}

const MAX_VOICE_SECONDS = 5
const VOICE_MEMO_MAX = 4
const MAX_ATTEMPTS = 3
const ARABIC_SCRIPT = /[\u0600-\u06FF]/

function toTensor(array: NpyArray): ort.Tensor {
  return new DynamicTensor(TENSOR_TYPES[array.dtype], array.data.slice(), array.shape)
}

function scatterKv(cache: ort.Tensor, kv: ort.Tensor, offset: number): void {
  const dims = cache.dims
  const blocks = dims[0] * dims[1]
  const capacity = dims[2]
  const inner = dims.slice(3).reduce((product, value) => product * value, 1)
  const steps = kv.dims[2]
  const target = cache.data as Float32Array
  const source = kv.data as Float32Array
  for (let block = 0; block < blocks; block++) {
    target.set(source.subarray(block * steps * inner, (block + 1) * steps * inner), (block * capacity + offset) * inner)
  }
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1
  }
  return 0
}

export class PocketTtsEngine {
  readonly sampleRate: number
  private readonly c: EngineConstants
  private readonly lut: Float32Array
  private readonly speakerProj: Float32Array
  private readonly bosVoice: Float32Array
  private readonly embStd: Float32Array
  private readonly embMean: Float32Array
  private readonly decoderInputs: readonly string[]
  private readonly decoderOutputs: readonly string[]
  private readonly cacheSlots: number[]
  private readonly smallSlots: number[]
  private readonly smallOutputs: number[]
  private readonly kvOutputs: number[]
  private readonly chunker: PhonemeChunker
  private readonly planner: TextPlanner
  private readonly voiceAudio = new Map<string, Float32Array>()
  private readonly voiceMemo = new Map<string, PreparedVoice>()
  private readonly rng = new Rng()

  constructor(private readonly assets: EngineAssets) {
    this.c = assets.constants
    this.sampleRate = this.c.sample_rate
    this.lut = this.weight('lut_weight')
    this.speakerProj = this.weight('speaker_proj')
    this.bosVoice = this.weight('bos_before_voice')
    this.embStd = this.weight('emb_std')
    this.embMean = this.weight('emb_mean')

    this.decoderInputs = assets.decoder.inputNames
    this.decoderOutputs = assets.decoder.outputNames
    const stateNames = [...assets.decoderInit.keys()]
    const stateCount = this.decoderInputs.length - 1
    this.cacheSlots = stateNames.flatMap((name, index) => (name.endsWith('.cache') ? [index] : []))
    this.smallSlots = Array.from({ length: stateCount }, (_, index) => index).filter(
      (index) => !this.cacheSlots.includes(index),
    )
    this.smallOutputs = this.decoderOutputs.flatMap((name, index) =>
      name.endsWith('o') && name !== 'audio' ? [index] : [],
    )
    this.kvOutputs = this.decoderOutputs.flatMap((name, index) => (name.startsWith('kv') ? [index] : []))

    this.chunker = new PhonemeChunker((text) => assets.sp.encode(text).length)
    this.planner = new TextPlanner(assets.g2p, assets.sp)
  }

  private weight(name: string): Float32Array {
    const array = this.assets.weights.get(name)
    if (!array) throw new Error(`Missing weight array: ${name}`)
    return array.data as Float32Array
  }

  async registerVoice(id: string, samples: Float32Array): Promise<VoiceReport> {
    this.voiceAudio.set(id, samples)
    this.voiceMemo.delete(id)
    const voice = await this.prepareVoice(id)
    return { seconds: samples.length / this.sampleRate, droppedMs: voice.droppedMs }
  }

  private async prepareVoice(id: string): Promise<PreparedVoice> {
    const memoized = this.voiceMemo.get(id)
    if (memoized) {
      this.voiceMemo.delete(id)
      this.voiceMemo.set(id, memoized)
      return memoized
    }
    const samples = this.voiceAudio.get(id)
    if (!samples) throw new Error('صدای مرجع ثبت نشده است')

    const { ldim, dim, layers, heads, dim_per_head: headSize, cache_capacity: capacity } = this.c
    const limit = MAX_VOICE_SECONDS * this.sampleRate
    const { audio, droppedMs } = trimHotOnset(samples.length > limit ? samples.subarray(0, limit) : samples, this.sampleRate)

    const encoded = await this.assets.encoder.run({ audio: new ort.Tensor('float32', audio, [1, 1, audio.length]) })
    const latents = encoded[this.assets.encoder.outputNames[0]]
    const frames = latents.dims[1]
    const source = latents.data as Float32Array
    const textEmb = new Float32Array((frames + 1) * dim)
    textEmb.set(this.bosVoice)
    for (let t = 0; t < frames; t++) {
      for (let d = 0; d < dim; d++) {
        let sum = 0
        for (let k = 0; k < ldim; k++) sum += source[t * ldim + k] * this.speakerProj[d * ldim + k]
        textEmb[(t + 1) * dim + d] = sum
      }
    }

    const cache = new Float32Array(layers * 2 * capacity * heads * headSize)
    const step = await this.flowStep(new Float32Array(0), 0, textEmb, frames + 1, 0, new Float32Array(ldim), cache)
    const prepared: PreparedVoice = { cache, offset: step.offset, droppedMs }
    this.voiceMemo.set(id, prepared)
    while (this.voiceMemo.size > VOICE_MEMO_MAX) {
      this.voiceMemo.delete(this.voiceMemo.keys().next().value as string)
    }
    return prepared
  }

  private async flowStep(
    sequence: Float32Array,
    sequenceLength: number,
    textEmb: Float32Array,
    textLength: number,
    offset: number,
    noise: Float32Array,
    cache: Float32Array,
  ): Promise<FlowResult> {
    const { ldim, dim, layers, heads, dim_per_head: headSize, cache_capacity: capacity } = this.c
    if (offset + sequenceLength + textLength > capacity) {
      throw new Error(
        `flow cache overflow: offset ${offset} + ${sequenceLength + textLength} exceeds capacity ${capacity} (max ~18 phoneme tokens per chunk)`,
      )
    }
    const output = await this.assets.flow.run({
      sequence: new ort.Tensor('float32', sequence, [1, sequenceLength, ldim]),
      text_emb: new ort.Tensor('float32', textEmb, [1, textLength, dim]),
      offset: new ort.Tensor('int64', BigInt64Array.of(BigInt(offset)), []),
      noise: new ort.Tensor('float32', noise, [1, ldim]),
      cache: new ort.Tensor('float32', cache, [layers, 2, capacity, heads, headSize]),
    })
    const newKv = output.newkv.data as Float32Array
    const steps = output.newkv.dims[2]
    const rowSize = steps * heads * headSize
    for (let block = 0; block < layers * 2; block++) {
      cache.set(newKv.subarray(block * rowSize, (block + 1) * rowSize), (block * capacity + offset) * heads * headSize)
    }
    return {
      latent: new Float32Array(output.latent.data as Float32Array),
      eos: (output.eos.data as Float32Array)[0],
      offset: offset + steps,
    }
  }

  private async generateChunk(cache: Float32Array, offset: number, chunk: string, rng: Rng): Promise<Float32Array[]> {
    const { ldim, dim, temp, tokens_per_second_estimate: tps, gen_seconds_padding: padding, frame_rate: frameRate } = this.c
    const tokens = this.assets.sp.encode(chunk)
    const textEmb = new Float32Array(tokens.length * dim)
    tokens.forEach((token, index) => textEmb.set(this.lut.subarray(token * dim, (token + 1) * dim), index * dim))

    const scale = Math.sqrt(temp)
    const makeNoise = () => Float32Array.from({ length: ldim }, () => rng.gaussian() * scale)
    let step = await this.flowStep(new Float32Array(ldim).fill(NaN), 1, textEmb, tokens.length, offset, makeNoise(), cache)
    const latents = [step.latent]

    const wordCount = chunk.split(/\s+/).filter(Boolean).length
    const framesAfterEos = (wordCount <= 4 ? 3 : 1) + 2
    const maxGenerated = Math.ceil((tokens.length / tps + padding) * frameRate)
    const emptyText = new Float32Array(0)
    let eosStep: number | null = null
    for (let i = 0; i < maxGenerated; i++) {
      step = await this.flowStep(latents[latents.length - 1], 1, emptyText, 0, step.offset, makeNoise(), cache)
      if (step.eos !== 0 && eosStep === null) eosStep = i
      if (eosStep !== null && i >= eosStep + framesAfterEos) break
      latents.push(step.latent)
    }
    return latents
  }

  private async decodeAll(latents: readonly Float32Array[]): Promise<Float32Array> {
    const { ldim, mimi_steps_per_latent: stepsPerLatent } = this.c
    const states = [...this.assets.decoderInit.values()].map(toTensor)
    const audio: Float32Array[] = []
    let offset = 0
    for (const latent of latents) {
      const unnormalized = Float32Array.from(latent, (value, index) => value * this.embStd[index] + this.embMean[index])
      const feeds: Record<string, ort.Tensor> = {
        [this.decoderInputs[0]]: new ort.Tensor('float32', unnormalized, [1, 1, ldim]),
      }
      states.forEach((state, index) => {
        feeds[this.decoderInputs[1 + index]] = state
      })
      const result = await this.assets.decoder.run(feeds)
      audio.push(new Float32Array(result[this.decoderOutputs[0]].data as Float32Array))
      this.smallOutputs.forEach((outputIndex, j) => {
        states[this.smallSlots[j]] = result[this.decoderOutputs[outputIndex]]
      })
      this.kvOutputs.forEach((outputIndex, j) => {
        scatterKv(states[this.cacheSlots[j]], result[this.decoderOutputs[outputIndex]], offset)
      })
      offset += stepsPerLatent
    }
    return concatFloat32(audio)
  }

  private async generateWithRetry(voice: PreparedVoice, chunk: string, rng: Rng): Promise<Float32Array> {
    const sampleRate = this.sampleRate
    const expectedSpeech = this.assets.sp.encode(chunk).length / this.c.tokens_per_second_estimate
    let best: Float32Array = new Float32Array(0)
    let bestKey: number[] | null = null
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const latents = await this.generateChunk(voice.cache.slice(), voice.offset, chunk, rng)
      const audio = await this.decodeAll(latents)
      const [from, to] = speechBounds(audio, sampleRate)
      const speech = compressPauses(audio.subarray(from, to), sampleRate, 0.3, 0.12)
      const duration = speech.length / sampleRate
      const loudOk = rms(speech) >= 0.02
      const fraction = solidFraction(speech, sampleRate)
      const solidDuration = fraction * duration
      const durationOk = 0.3 * expectedSpeech <= solidDuration && solidDuration <= 1.6 * expectedSpeech
      const regions = deadAirRegions(speech, sampleRate)
      const dead = regions.length > 0 ? Math.max(...regions.map(([start, end]) => end - start)) / sampleRate : 0
      const key = [loudOk ? 1 : 0, durationOk ? 1 : 0, solidDuration, dead <= 0.35 ? 0 : -dead]
      if (bestKey === null || compareKeys(key, bestKey) > 0) {
        best = speech
        bestKey = key
      }
      if (loudOk && durationOk && fraction >= 0.55 && dead <= 0.35) break
    }
    return best
  }

  async synthesize(input: string | readonly PlanItem[], voiceId: string, pace: number): Promise<Float32Array> {
    const clampedPace = Math.min(Math.max(pace, MIN_PACE), MAX_PACE)
    const voice = await this.prepareVoice(voiceId)
    const phrases: Array<{ phonemes: string; gap: number | null }> =
      typeof input === 'string' ? [{ phonemes: input, gap: null }] : input.map((item) => ({ ...item }))

    const jobs: Array<{ chunk: string; gap: number }> = []
    phrases
      .map((phrase) => ({ phonemes: phrase.phonemes.trim(), gap: phrase.gap }))
      .filter((phrase) => phrase.phonemes.length > 0)
      .forEach((phrase, phraseIndex) => {
        this.chunker.chunk(phrase.phonemes).forEach((chunk, chunkIndex) => {
          const gap = phraseIndex === 0 && chunkIndex === 0 ? 0 : chunkIndex === 0 ? (phrase.gap ?? PHRASE_GAP) : CHUNK_GAP
          jobs.push({ chunk, gap })
        })
      })

    const segments: Segment[] = []
    for (const job of jobs) {
      segments.push({ audio: await this.generateWithRetry(voice, job.chunk, this.rng.fork()), gap: job.gap })
    }
    return timeStretch(stitch(segments, this.sampleRate), clampedPace)
  }

  private checkText(text: string): string {
    const trimmed = text.trim()
    if (!trimmed) throw new Error('متن خالی است')
    if (trimmed.length > MAX_TEXT_CHARS) throw new Error(`متن طولانی است (حداکثر ${MAX_TEXT_CHARS} نویسه)`)
    return trimmed
  }

  private async plan(sentence: string, mode: SynthesisMode): Promise<PlanItem[]> {
    try {
      const plan = await this.planner.planSentence(sentence)
      return mode === 'pack' ? packPhrases(plan) : plan
    } catch (error) {
      if (error instanceof NormalizationError) throw new Error('متن فارسی معتبری پیدا نشد')
      throw error
    }
  }

  async phonemize(text: string, mode: SynthesisMode): Promise<string> {
    const phonemes: string[] = []
    for (const sentence of splitSentences(this.checkText(text))) {
      const plan = await this.plan(sentence, mode)
      phonemes.push(...plan.map((item) => item.phonemes.replaceAll('1', '')))
    }
    const joined = phonemes.join(' ').trim()
    if (!joined) throw new Error('فونمی تولید نشد')
    return joined
  }

  async synthesizeText(
    text: string,
    voiceId: string,
    mode: SynthesisMode,
    pace: number,
    onProgress?: (done: number, total: number) => void,
  ): Promise<TextSynthesis> {
    const clampedPace = Math.min(Math.max(pace, MIN_PACE), MAX_PACE)
    const sentences = splitSentences(this.checkText(text))
    const phonemes: string[] = []
    const parts: Float32Array[] = []

    for (let index = 0; index < sentences.length; index++) {
      const plan = await this.plan(sentences[index], mode)
      if (plan.length === 0) continue
      const tokens = plan.reduce((sum, item) => sum + this.assets.sp.encode(item.phonemes.replaceAll('1', '')).length, 0)
      const cap = tokens / this.c.tokens_per_second_estimate + this.c.gen_seconds_padding + 1
      let audio = new Float32Array(0)
      for (let attempt = 0; attempt < 2; attempt++) {
        audio = await this.synthesize(plan, voiceId, clampedPace)
        if (audio.length / this.sampleRate <= cap + 2) break
      }
      phonemes.push(plan.map((item) => item.phonemes.replaceAll('1', '')).join(' '))
      parts.push(audio, new Float32Array(Math.floor((SENTENCE_GAP / clampedPace) * this.sampleRate)))
      onProgress?.(index + 1, sentences.length)
    }
    if (parts.length === 0) throw new Error('متنی برای ساخت صدا پیدا نشد')
    return { audio: concatFloat32(parts.slice(0, -1)), phonemes: phonemes.join(' '), sentences: phonemes.length }
  }

  async synthesizePhonemes(phonemes: string, voiceId: string, pace: number): Promise<Float32Array> {
    const trimmed = phonemes.trim()
    if (!trimmed) throw new Error('فونم خالی است')
    if (trimmed.length > MAX_PHONEME_CHARS) throw new Error(`فونم طولانی است (حداکثر ${MAX_PHONEME_CHARS} نویسه)`)
    if (ARABIC_SCRIPT.test(trimmed)) {
      throw new Error('در کادر فونم فقط فونم لاتین وارد کنید؛ متن فارسی را در کادر متن بنویسید')
    }
    const audio = await this.synthesize(trimmed, voiceId, pace)
    if (audio.length === 0) throw new Error('صوتی تولید نشد')
    return audio
  }
}
