import { env, pipeline } from '@huggingface/transformers';
import { WordTimingRefiner } from '@/lib/lyrics/wordTimingRefiner';
import type { LyricWord } from '@/lib/lyrics/types';
import {
  WHISPER_SAMPLE_RATE,
  type RawWord,
  type TranscribeMessage,
  type TranscribeRequest,
} from '@/lib/lyrics/transcribeProtocol';

type Device = 'webgpu' | 'wasm';
type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>;

interface ProgressInfo {
  readonly status: string;
  readonly file?: string;
  readonly loaded?: number;
  readonly total?: number;
}

interface WhisperChunk {
  readonly text: string;
  readonly timestamp: readonly [number, number | null];
}

interface AudioWindow {
  readonly start: number;
  readonly end: number;
  readonly keepFrom: number;
  readonly keepTo: number;
}

interface TranscriptionOutcome {
  readonly words: RawWord[];
  readonly device: Device;
}

const WINDOW_SECONDS = 30;
const OVERLAP_SECONDS = 4;
const YIELD_MS = 60;
const FALLBACK_WORD_SECONDS = 0.4;

env.allowLocalModels = false;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = Math.max(
    1,
    Math.floor((navigator.hardwareConcurrency ?? 4) / 2),
  );
}

function send(message: TranscribeMessage): void {
  self.postMessage(message);
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class AudioPreprocessor {
  toWhisperInput(left: Float32Array, right: Float32Array, sampleRate: number): Float32Array {
    return this.resample(this.mixToMono(left, right), sampleRate, WHISPER_SAMPLE_RATE);
  }

  private mixToMono(left: Float32Array, right: Float32Array): Float32Array {
    const length = Math.min(left.length, right.length);
    const mono = new Float32Array(length);

    for (let i = 0; i < length; i += 1) {
      mono[i] = (left[i] + right[i]) * 0.5;
    }
    return mono;
  }

  private resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) {
      return input;
    }

    const ratio = fromRate / toRate;
    const length = Math.max(1, Math.floor(input.length / ratio));
    const output = new Float32Array(length);

    for (let i = 0; i < length; i += 1) {
      const from = i * ratio;
      const to = Math.min((i + 1) * ratio, input.length);
      const first = Math.floor(from);
      const last = Math.min(input.length, Math.max(first + 1, Math.ceil(to)));

      let sum = 0;
      let weights = 0;
      for (let j = first; j < last; j += 1) {
        const overlap = Math.min(j + 1, to) - Math.max(j, from);
        if (overlap <= 0) {
          continue;
        }
        sum += input[j] * overlap;
        weights += overlap;
      }
      output[i] = weights > 0 ? sum / weights : 0;
    }

    return output;
  }
}

class WindowPlanner {
  plan(totalSeconds: number): AudioWindow[] {
    const step = WINDOW_SECONDS - OVERLAP_SECONDS;
    const half = OVERLAP_SECONDS / 2;
    const windows: AudioWindow[] = [];

    for (let start = 0; ; start += step) {
      const end = Math.min(start + WINDOW_SECONDS, totalSeconds);
      const isFirst = start === 0;
      const isLast = end >= totalSeconds;

      windows.push({
        start,
        end,
        keepFrom: isFirst ? 0 : start + half,
        keepTo: isLast ? Number.POSITIVE_INFINITY : end - half,
      });

      if (isLast) {
        return windows;
      }
    }
  }
}

class DownloadProgress {
  private readonly files = new Map<string, { loaded: number; total: number }>();

  update(info: ProgressInfo): void {
    if (info.status !== 'progress' || !info.file) {
      return;
    }

    this.files.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 });

    let loaded = 0;
    let total = 0;
    for (const file of this.files.values()) {
      loaded += file.loaded;
      total += file.total;
    }

    send({ type: 'model-progress', loaded, total });
  }
}

class WhisperJob {
  constructor(private readonly request: TranscribeRequest) {}

  async run(): Promise<void> {
    send({ type: 'status', message: 'در حال آماده‌سازی صدا...' });
    const audio = new AudioPreprocessor().toWhisperInput(
      this.request.left,
      this.request.right,
      this.request.sampleRate,
    );

    const outcome = await this.transcribeWithFallback(audio);
    if (outcome.words.length === 0) {
      send({ type: 'done', words: [], device: outcome.device });
      return;
    }

    send({ type: 'status', message: 'در حال دقیق‌سازی زمان‌بندی کلمه‌ها...' });
    const refined = this.refine(audio, outcome.words);
    send({ type: 'done', words: refined, device: outcome.device });
  }

  private async transcribeWithFallback(audio: Float32Array): Promise<TranscriptionOutcome> {
    const devices: Device[] = (await this.hasWebGpu()) ? ['webgpu', 'wasm'] : ['wasm'];
    let lastError: unknown = null;

    for (const device of devices) {
      try {
        const transcriber = await this.createTranscriber(device);
        const words = await this.transcribeWindows(transcriber, audio, device);
        return { words, device };
      } catch (error) {
        lastError = error;
        if (device === 'webgpu') {
          send({ type: 'status', message: 'WebGPU کار نکرد، اجرای دوباره با WASM...' });
        }
      }
    }

    throw lastError;
  }

  private async createTranscriber(device: Device): Promise<Transcriber> {
    const progress = new DownloadProgress();
    send({ type: 'status', message: 'در حال بارگذاری مدل...' });

    const options = {
      device,
      dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
      progress_callback: (info: ProgressInfo) => progress.update(info),
    } as Parameters<typeof pipeline>[2];

    return (await pipeline(
      'automatic-speech-recognition',
      this.request.modelId,
      options,
    )) as unknown as Transcriber;
  }

  private async transcribeWindows(
    transcriber: Transcriber,
    audio: Float32Array,
    device: Device,
  ): Promise<RawWord[]> {
    const windows = new WindowPlanner().plan(audio.length / WHISPER_SAMPLE_RATE);
    const words: RawWord[] = [];

    send({
      type: 'status',
      message: device === 'webgpu' ? 'تشخیص متن با WebGPU...' : 'تشخیص متن با WASM...',
    });

    for (const [index, audioWindow] of windows.entries()) {
      send({ type: 'window-progress', done: index, total: windows.length });

      const from = Math.floor(audioWindow.start * WHISPER_SAMPLE_RATE);
      const to = Math.ceil(audioWindow.end * WHISPER_SAMPLE_RATE);
      const output = await transcriber(audio.subarray(from, to), this.buildOptions());

      words.push(...this.parseWords(output, audioWindow));
      await pause(YIELD_MS);
    }

    send({ type: 'window-progress', done: windows.length, total: windows.length });
    return words;
  }

  private buildOptions(): Record<string, unknown> {
    const options: Record<string, unknown> = {
      return_timestamps: 'word',
      task: 'transcribe',
      top_k: 0,
      do_sample: false,
    };

    if (this.request.language) {
      options.language = this.request.language;
    }

    return options;
  }

  private parseWords(output: unknown, audioWindow: AudioWindow): RawWord[] {
    const result = (Array.isArray(output) ? output[0] : output) as
      | { chunks?: WhisperChunk[] }
      | undefined;
    const words: RawWord[] = [];

    for (const chunk of result?.chunks ?? []) {
      const text = chunk.text.trim();
      if (text.length === 0) {
        continue;
      }

      const start = chunk.timestamp[0] + audioWindow.start;
      const end = (chunk.timestamp[1] ?? chunk.timestamp[0] + FALLBACK_WORD_SECONDS) + audioWindow.start;
      const middle = (start + end) / 2;

      if (middle < audioWindow.keepFrom || middle >= audioWindow.keepTo) {
        continue;
      }

      words.push({ text, start, end: Math.max(end, start) });
    }

    return words;
  }

  private refine(audio: Float32Array, words: readonly RawWord[]): LyricWord[] {
    const offset = this.request.rangeStart;
    const absolute = words.map((word) => ({
      text: word.text,
      start: word.start + offset,
      end: word.end + offset,
    }));

    const refiner = new WordTimingRefiner(audio, WHISPER_SAMPLE_RATE, offset);
    return [...refiner.refine(absolute)];
  }

  private async hasWebGpu(): Promise<boolean> {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) {
      return false;
    }

    try {
      return (await gpu.requestAdapter()) !== null;
    } catch {
      return false;
    }
  }
}

self.onmessage = async (event: MessageEvent<TranscribeRequest>) => {
  if (event.data?.type !== 'transcribe') {
    return;
  }

  try {
    await new WhisperJob(event.data).run();
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};