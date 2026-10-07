import type { RawWord, TranscribeMessage, TranscribeRequest } from './transcribeProtocol';

export type TranscribeProgress =
  | { readonly kind: 'model'; readonly loaded: number; readonly total: number }
  | { readonly kind: 'status'; readonly message: string };

export interface TranscribeResult {
  readonly words: readonly RawWord[];
  readonly device: 'webgpu' | 'wasm';
}

export class TranscribeClient {
  onProgress: ((progress: TranscribeProgress) => void) | null = null;

  private worker: Worker | null = null;
  private rejectPending: ((error: Error) => void) | null = null;

  transcribe(request: Omit<TranscribeRequest, 'type'>): Promise<TranscribeResult> {
    this.cancel();

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

      const message: TranscribeRequest = { type: 'transcribe', ...request };
      worker.postMessage(message, [request.audio.buffer]);
    });
  }

  cancel(): void {
    const reject = this.rejectPending;
    this.release();
    reject?.(new Error('تشخیص متن لغو شد.'));
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
