import type { LyricWord, TimeRange } from './types';

export interface WhisperModelOption {
  readonly id: string;
  readonly label: string;
}

export interface LanguageOption {
  readonly code: string | null;
  readonly label: string;
}

export const WHISPER_MODELS: readonly WhisperModelOption[] = [
  { id: 'onnx-community/whisper-base_timestamped', label: 'Base (سریع‌تر، دقت کمتر)' },
  { id: 'onnx-community/whisper-small_timestamped', label: 'Small (دقیق‌تر، سنگین‌تر)' },
];

export const LANGUAGES: readonly LanguageOption[] = [
  { code: 'persian', label: 'فارسی' },
  { code: 'english', label: 'English' },
  { code: 'arabic', label: 'العربية' },
  { code: 'turkish', label: 'Türkçe' },
  { code: null, label: 'تشخیص خودکار' },
];

export const WHISPER_SAMPLE_RATE = 16000;

export interface TranscribeInput {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly sampleRate: number;
  readonly range: TimeRange;
  readonly modelId: string;
  readonly language: string | null;
}

export interface TranscribeRequest {
  readonly type: 'transcribe';
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly sampleRate: number;
  readonly rangeStart: number;
  readonly modelId: string;
  readonly language: string | null;
}

export interface RawWord {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export type TranscribeMessage =
  | { readonly type: 'model-progress'; readonly loaded: number; readonly total: number }
  | { readonly type: 'window-progress'; readonly done: number; readonly total: number }
  | { readonly type: 'status'; readonly message: string }
  | { readonly type: 'done'; readonly words: readonly LyricWord[]; readonly device: 'webgpu' | 'wasm' }
  | { readonly type: 'error'; readonly message: string };