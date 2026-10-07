import type { LyricWord } from './types';
import type {
  TranscribeInput,
  TranscribeMessage,
  TranscribeRequest,
} from './transcribeProtocol';

export type TranscribeProgress =
  | { readonly kind: 'model'; readonly loaded: number; readonly total: number }
  | { readonly kind: 'decode'; readonly done: number; readonly total: number }
  | { readonly kind: 'status'; readonly message: string };

export interface TranscribeResult {
  readonly words: readonly LyricWord[];
  readonly device: 'webgpu' | 'wasm';
}

export class TranscribeClient {
  onProgress: ((progress: TranscribeProgress) => void) | null = null;

  private worker: Worker | null = null;
  private rejectPending: ((error: Error) => void) | null = null;

  transcribe(input: TranscribeInput): Promise<TranscribeResult> {
    this.cancel();

    const request = this.buildRequest(input);
    const worker = new Worker(new URL('../../workers/transcribe.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker = worker;

    return new Promise<TranscribeResult>((resolve, reject) => {
      this.rejectPending = reject;

      worker.onmessage = (event: MessageEvent<TranscribeMessage>) => {
        this.handle(event.data, resolve, reject);
      };
      worker.onerror = (event) => {
        this.release();
        reject(new Error(event.message || 'خطا در Worker تشخیص متن'));
      };

      worker.postMessage(request, [request.left.buffer, request.right.buffer]);
    });
  }

  cancel(): void {
    const reject = this.rejectPending;
    this.release();
    reject?.(new Error('تشخیص متن لغو شد.'));
  }

  private buildRequest(input: TranscribeInput): TranscribeRequest {
    const available = Math.min(input.left.length, input.right.length);
    const from = Math.max(0, Math.floor(input.range.start * input.sampleRate));
    const to = Math.min(available, Math.ceil(input.range.end * input.sampleRate));

    if (to <= from) {
      throw new Error('بازه‌ی انتخاب‌شده خالی است.');
    }

    return {
      type: 'transcribe',
      left: input.left.slice(from, to),
      right: input.right.slice(from, to),
      sampleRate: input.sampleRate,
      rangeStart: input.range.start,
      modelId: input.modelId,
      language: input.language,
    };
  }

  private handle(
    message: TranscribeMessage,
    resolve: (result: TranscribeResult) => void,
    reject: (error: Error) => void,
  ): void {
    switch (message.type) {
      case 'model-progress':
        this.onProgress?.({ kind: 'model', loaded: message.loaded, total: message.total });
        break;
      case 'window-progress':
        this.onProgress?.({ kind: 'decode', done: message.done, total: message.total });
        break;
      case 'status':
        this.onProgress?.({ kind: 'status', message: message.message });
        break;
      case 'done':
        this.release();
        resolve({ words: message.words, device: message.device });
        break;
      case 'error':
        this.release();
        reject(new Error(message.message));
        break;
    }
  }

  private release(): void {
    this.worker?.terminate();
    this.worker = null;
    this.rejectPending = null;
  }
}