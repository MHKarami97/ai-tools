export type BackgroundKind = 'solid' | 'gradient' | 'image';
export type TextAnimation = 'none' | 'fade' | 'slide' | 'typewriter' | 'karaoke';

export interface VideoSize {
  readonly width: number;
  readonly height: number;
}

export interface SizePreset extends VideoSize {
  readonly id: string;
  readonly label: string;
}

export interface FontOption {
  readonly id: string;
  readonly label: string;
  readonly family: string;
  readonly weights: readonly number[];
}

export interface VideoStyle {
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly fontScale: number;
  readonly textColor: string;
  readonly highlightColor: string;
  readonly textShadow: boolean;
  readonly showContext: boolean;
  readonly animation: TextAnimation;
  readonly background: BackgroundKind;
  readonly backgroundColor: string;
  readonly gradientFrom: string;
  readonly gradientTo: string;
  readonly gradientAngle: number;
  readonly backgroundImage: ImageBitmap | null;
  readonly imageDim: number;
}

export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: 'reels', label: 'ریلز / استوری ۹:۱۶ (1080×1920)', width: 1080, height: 1920 },
  { id: 'reels-light', label: '۹:۱۶ سبک‌تر (720×1280)', width: 720, height: 1280 },
  { id: 'portrait', label: 'پرتره ۴:۵ (1080×1350)', width: 1080, height: 1350 },
  { id: 'square', label: 'مربع ۱:۱ (1080×1080)', width: 1080, height: 1080 },
  { id: 'landscape', label: 'افقی ۱۶:۹ (1920×1080)', width: 1920, height: 1080 },
];

export const FPS_OPTIONS: readonly number[] = [10, 15, 20, 24, 30];
export const MAX_FPS = 30;
export const DEFAULT_FPS = 30;
export const MIN_DIMENSION = 240;
export const MAX_DIMENSION = 2160;

export const FONT_OPTIONS: readonly FontOption[] = [
  { id: 'vazirmatn', label: 'وزیرمتن', family: 'Vazirmatn', weights: [300, 400, 500, 700, 900] },
  { id: 'tahoma', label: 'Tahoma', family: 'Tahoma', weights: [400, 700] },
  { id: 'arial', label: 'Arial', family: 'Arial', weights: [400, 700] },
  { id: 'georgia', label: 'Georgia', family: 'Georgia', weights: [400, 700] },
];

export const DEFAULT_STYLE: Omit<VideoStyle, 'backgroundImage'> = {
  fontFamily: 'Vazirmatn',
  fontWeight: 700,
  fontScale: 0.075,
  textColor: '#ffffff',
  highlightColor: '#63d6b3',
  textShadow: true,
  showContext: false,
  animation: 'karaoke',
  background: 'gradient',
  backgroundColor: '#0b1322',
  gradientFrom: '#0f2b4a',
  gradientTo: '#1b7f67',
  gradientAngle: 160,
  imageDim: 0.45,
};

export function normalizeSize(size: VideoSize): VideoSize {
  const clamp = (value: number): number => {
    const safe = Number.isFinite(value) ? Math.round(value) : MIN_DIMENSION;
    return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, safe)) & ~1;
  };

  return { width: clamp(size.width), height: clamp(size.height) };
}

export function clampFps(fps: number): number {
  return Math.min(MAX_FPS, Math.max(1, Math.round(fps)));
}
