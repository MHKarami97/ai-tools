import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type AudioCodec,
  type VideoCodec,
} from 'mediabunny';
import type { LyricLine, TimeRange } from '@/lib/lyrics/types';
import { fontLoader } from './fontLoader';
import { LyricFrameRenderer } from './lyricRenderer';
import { yieldToUi } from './scheduling';
import { clampFps, normalizeSize, type VideoSize, type VideoStyle } from './videoStyle';

export interface VocalStem {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly sampleRate: number;
}

export interface VideoExportRequest {
  readonly vocals: VocalStem;
  readonly range: TimeRange;
  readonly size: VideoSize;
  readonly fps: number;
  readonly lines: readonly LyricLine[];
  readonly style: VideoStyle;
}

export interface VideoExportProgress {
  readonly phase: 'prepare' | 'render' | 'finalize';
  readonly fraction: number;
}

export interface VideoExportResult {
  readonly blob: Blob;
  readonly videoCodec: VideoCodec;
  readonly audioCodec: AudioCodec;
}

export class ExportCancelledError extends Error {
  constructor() {
    super('ساخت ویدئو لغو شد.');
  }
}

const VIDEO_CODEC_PREFERENCE: readonly VideoCodec[] = ['avc', 'vp9', 'av1', 'hevc'];
const AUDIO_CODEC_PREFERENCE: readonly AudioCodec[] = ['aac', 'opus'];
const AUDIO_BITRATE = 128_000;
const AUDIO_FADE_SECONDS = 0.015;
const BITS_PER_PIXEL = 0.08;
const MIN_VIDEO_BITRATE = 1_500_000;
const MAX_VIDEO_BITRATE = 12_000_000;
const YIELD_EVERY_FRAMES = 6;
const PROGRESS_EVERY_FRAMES = 4;

export class LyricVideoExporter {
  private cancelled = false;

  async export(
    request: VideoExportRequest,
    onProgress: (progress: VideoExportProgress) => void,
  ): Promise<VideoExportResult> {
    this.cancelled = false;

    const size = normalizeSize(request.size);
    const fps = clampFps(request.fps);
    const audioBuffer = this.createAudioBuffer(request.vocals, request.range);
    const duration = audioBuffer.duration;
    const totalFrames = Math.max(1, Math.ceil(duration * fps));
    const bitrate = this.resolveVideoBitrate(size, fps);

    onProgress({ phase: 'prepare', fraction: 0 });

    const videoCodec = await getFirstEncodableVideoCodec(VIDEO_CODEC_PREFERENCE.slice(), {
      width: size.width,
      height: size.height,
      quality: new Quality({ bitrate }),
    });
    if (videoCodec === null) {
      throw new Error('مرورگر شما برای این اندازه و نرخ فریم، انکودر ویدئو ندارد. اندازه را کوچک‌تر کنید.');
    }

    const audioCodec = await getFirstEncodableAudioCodec(AUDIO_CODEC_PREFERENCE.slice(), {
      numberOfChannels: 2,
      sampleRate: audioBuffer.sampleRate,
      quality: new Quality({ bitrate: AUDIO_BITRATE }),
    });
    if (audioCodec === null) {
      throw new Error('مرورگر شما انکودر صدا (AAC یا Opus) ندارد.');
    }

    await fontLoader.ensure(request.style.fontFamily, request.style.fontWeight);

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx === null) {
      throw new Error('ساخت بوم رسم ممکن نیست.');
    }

    const renderer = new LyricFrameRenderer(size, request.style, request.lines);
    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });

    const videoSource = new CanvasSource(canvas, { codec: videoCodec, quality: new Quality({ bitrate }) });
    const audioSource = new AudioBufferSource({ codec: audioCodec, quality: new Quality({ bitrate: AUDIO_BITRATE }) });
    output.addVideoTrack(videoSource, { frameRate: fps });
    output.addAudioTrack(audioSource);

    try {
      await output.start();
      await audioSource.add(audioBuffer);
      audioSource.close();

      for (let frame = 0; frame < totalFrames; frame++) {
        this.throwIfCancelled();

        renderer.render(ctx, request.range.start + frame / fps);
        await videoSource.add(frame / fps, 1 / fps);

        if (frame % PROGRESS_EVERY_FRAMES === 0) {
          onProgress({ phase: 'render', fraction: frame / totalFrames });
        }
        if (frame % YIELD_EVERY_FRAMES === 0) {
          await yieldToUi();
        }
      }

      videoSource.close();
      onProgress({ phase: 'finalize', fraction: 1 });
      await output.finalize();
    } catch (error) {
      await this.discard(output);
      throw this.cancelled ? new ExportCancelledError() : error;
    }

    const buffer = (output.target as BufferTarget).buffer;
    if (buffer === null) {
      throw new Error('خروجی ویدئو ساخته نشد.');
    }

    return { blob: new Blob([buffer], { type: 'video/mp4' }), videoCodec, audioCodec };
  }

  cancel(): void {
    this.cancelled = true;
  }

  private throwIfCancelled(): void {
    if (this.cancelled) {
      throw new ExportCancelledError();
    }
  }

  private async discard(output: Output): Promise<void> {
    try {
      await output.cancel();
    } catch {
      // The output may already be finalized or canceled.
    }
  }

  private resolveVideoBitrate(size: VideoSize, fps: number): number {
    const estimate = size.width * size.height * fps * BITS_PER_PIXEL;
    return Math.round(Math.min(MAX_VIDEO_BITRATE, Math.max(MIN_VIDEO_BITRATE, estimate)));
  }

  private createAudioBuffer(stem: VocalStem, range: TimeRange): AudioBuffer {
    const available = Math.min(stem.left.length, stem.right.length);
    const start = Math.max(0, Math.floor(range.start * stem.sampleRate));
    const end = Math.min(available, Math.ceil(range.end * stem.sampleRate));
    const length = end - start;

    if (length <= 0) {
      throw new Error('بازهٔ انتخاب‌شده خالی است.');
    }

    const buffer = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: stem.sampleRate });
    const fade = Math.min(Math.round(AUDIO_FADE_SECONDS * stem.sampleRate), length >> 1);

    this.copyWithFade(stem.left, start, buffer.getChannelData(0), fade);
    this.copyWithFade(stem.right, start, buffer.getChannelData(1), fade);

    return buffer;
  }

  private copyWithFade(source: Float32Array, start: number, target: Float32Array, fade: number): void {
    target.set(source.subarray(start, start + target.length));

    for (let i = 0; i < fade; i++) {
      const gain = (i + 1) / fade;
      target[i] *= gain;
      target[target.length - 1 - i] *= gain;
    }
  }
}
