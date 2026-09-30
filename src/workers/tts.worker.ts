import { expose } from 'comlink';
import { configureOrt, createSession, ort, type ExternalData } from '@/lib/ort/runtime';
import { parseNpz, type NpyArray } from '@/lib/npz';
import { getModelBlob } from '@/lib/tts/modelDownloader';
import { OnnxG2P } from '@/lib/tts/g2p';
import { SentencePieceModel } from '@/lib/tts/sentencepiece';
import {
  PocketTtsEngine,
  type EngineAssets,
  type EngineConstants,
  type TextSynthesis,
} from '@/lib/tts/engine';
import type { SynthesisMode, VoiceReport } from '@/workers/protocol';

interface Manifest {
  readonly constants: EngineConstants;
}

class CachedModelReader {
  async bytes(name: string): Promise<Uint8Array> {
    const blob = await getModelBlob(name);
    if (!blob) {
      throw new Error(`Model file is not in the cache: ${name}`);
    }
    return new Uint8Array(await blob.arrayBuffer());
  }

  async text(name: string): Promise<string> {
    return new TextDecoder().decode(await this.bytes(name));
  }

  async npz(name: string): Promise<Map<string, NpyArray>> {
    const bytes = await this.bytes(name);
    return parseNpz(bytes.buffer as ArrayBuffer);
  }

  async session(name: string, dataName?: string): Promise<ort.InferenceSession> {
    const model = await this.bytes(name);
    const externalData: ExternalData | undefined = dataName
      ? [{ path: dataName, data: await this.bytes(dataName) }]
      : undefined;
    return createSession(model, 'wasm', externalData);
  }
}

class TtsWorkerApi {
  private readonly reader = new CachedModelReader();
  private engine: PocketTtsEngine | null = null;
  private loading: Promise<void> | null = null;

  init(onProgress?: (done: number, total: number) => void): Promise<void> {
    this.loading ??= this.load(onProgress)
    return this.loading
  }

  async registerVoice(id: string, samples: Float32Array): Promise<VoiceReport> {
    return this.requireEngine().registerVoice(id, samples);
  }

  async phonemize(text: string, mode: SynthesisMode): Promise<string> {
    return this.requireEngine().phonemize(text, mode);
  }

  async synthesizeText(
    text: string,
    voiceId: string,
    mode: SynthesisMode,
    pace: number,
    onProgress?: (done: number, total: number) => void,
  ): Promise<TextSynthesis> {
    return this.requireEngine().synthesizeText(text, voiceId, mode, pace, onProgress);
  }

  async synthesizePhonemes(phonemes: string, voiceId: string, pace: number): Promise<Float32Array> {
    return this.requireEngine().synthesizePhonemes(phonemes, voiceId, pace);
  }

  private requireEngine(): PocketTtsEngine {
    if (!this.engine) {
      throw new Error('TTS engine is not initialised. Call init() first.');
    }
    return this.engine;
  }

  private async load(onProgress?: (done: number, total: number) => void): Promise<void> {
    configureOrt()
    const r = this.reader
    const total = 8
    let done = 0
    const track = <T>(promise: Promise<T>): Promise<T> =>
      promise.then((value) => {
        done += 1
        onProgress?.(done, total)
        return value
      })

    const manifest = JSON.parse(await r.text('manifest.json')) as Manifest
    const [flow, encoder, decoder, g2pEncoder, g2pDecoder, weights, decoderInit, tokenizer] =
      await Promise.all([
        track(r.session('flow_lm_step.onnx', 'flow_lm_step.onnx.data')),
        track(r.session('mimi_encoder.onnx', 'mimi_encoder.onnx.data')),
        track(r.session('mimi_decoder_step_kv.onnx', 'mimi_decoder_step_kv.onnx.data')),
        track(r.session('g2p_encoder.onnx')),
        track(r.session('g2p_decoder.onnx', 'g2p_decoder.onnx.data')),
        track(r.npz('weights.npz')),
        track(r.npz('decode_state_init.npz')),
        track(r.bytes('tokenizer_ph.model')),
      ])

    const assets: EngineAssets = {
      constants: manifest.constants,
      flow,
      encoder,
      decoder,
      weights,
      decoderInit,
      sp: SentencePieceModel.parse(tokenizer.buffer as ArrayBuffer),
      g2p: new OnnxG2P(g2pEncoder, g2pDecoder),
    }
    this.engine = new PocketTtsEngine(assets)
  }
}

expose(new TtsWorkerApi());