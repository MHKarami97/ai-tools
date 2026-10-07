import { env, pipeline } from '@huggingface/transformers';
import type { RawWord, TranscribeMessage, TranscribeRequest } from '@/lib/lyrics/transcribeProtocol';

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

const CHUNK_LENGTH_SECONDS = 29;
const STRIDE_LENGTH_SECONDS = 5;
const FALLBACK_WORD_SECONDS = 0.4;

env.allowLocalModels = false;

function send(message: TranscribeMessage): void {
  self.postMessage(message);
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
    const devices: Device[] = (await this.hasWebGpu()) ? ['webgpu', 'wasm'] : ['wasm'];
    let lastError: unknown = null;

    for (const device of devices) {
      try {
        const words = await this.transcribeOn(device);
        send({ type: 'done', words, device });
        return;
      } catch (error) {
        lastError = error;
        if (device === 'webgpu') {
          send({ type: 'status', message: 'WebGPU کار نکرد، اجرای دوباره با WASM...' });
        }
      }
    }

    throw lastError;
  }

  private async transcribeOn(device: Device): Promise<RawWord[]> {
    const progress = new DownloadProgress();
    send({ type: 'status', message: 'در حال بارگذاری مدل...' });

    const options = {
      device,
      dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
      progress_callback: (info: ProgressInfo) => progress.update(info),
    } as Parameters<typeof pipeline>[2];

    const transcriber = (await pipeline(
      'automatic-speech-recognition',
      this.request.modelId,
      options,
    )) as unknown as Transcriber;

    send({ type: 'status', message: device === 'webgpu' ? 'تشخیص متن با WebGPU...' : 'تشخیص متن با WASM...' });

    const output = await transcriber(this.request.audio, this.buildOptions());
    return this.parseWords(output);
  }

  private buildOptions(): Record<string, unknown> {
    const options: Record<string, unknown> = {
      return_timestamps: 'word',
      chunk_length_s: CHUNK_LENGTH_SECONDS,
      stride_length_s: STRIDE_LENGTH_SECONDS,
      task: 'transcribe',
      top_k: 0,
      do_sample: false,
    };

    if (this.request.language) {
      options.language = this.request.language;
    }

    return options;
  }

  private parseWords(output: unknown): RawWord[] {
    const result = (Array.isArray(output) ? output[0] : output) as { chunks?: WhisperChunk[] } | undefined;
    const words: RawWord[] = [];

    for (const chunk of result?.chunks ?? []) {
      const text = chunk.text.trim();
      if (text.length === 0) {
        continue;
      }

      const start = chunk.timestamp[0];
      const end = chunk.timestamp[1] ?? start + FALLBACK_WORD_SECONDS;
      words.push({ text, start, end: Math.max(end, start) });
    }

    return words;
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
