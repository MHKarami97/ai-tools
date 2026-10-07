export interface SilenceTrimOptions {
  readonly thresholdDb: number;
  readonly minSilenceSeconds: number;
  readonly keepPaddingSeconds: number;
  readonly fadeSeconds: number;
}

export interface SampleRange {
  readonly start: number;
  readonly end: number;
}

export interface SilenceTrimResult {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly keptRanges: readonly SampleRange[];
  readonly removedRanges: readonly SampleRange[];
  readonly removedSeconds: number;
}

export type TrimSensitivity = 'gentle' | 'balanced' | 'aggressive';

export const SENSITIVITY_DB: Readonly<Record<TrimSensitivity, number>> = {
  gentle: 40,
  balanced: 32,
  aggressive: 26,
};

export const DEFAULT_TRIM_OPTIONS: SilenceTrimOptions = {
  thresholdDb: SENSITIVITY_DB.balanced,
  minSilenceSeconds: 1,
  keepPaddingSeconds: 0.25,
  fadeSeconds: 0.01,
};

const FRAME_SECONDS = 0.01;
const REFERENCE_PERCENTILE = 0.95;
const ABSOLUTE_FLOOR_RMS = 1e-4;
const BRIDGE_FRAMES = 3;

interface FrameRun {
  start: number;
  end: number;
}

export class SilenceTrimmer {
  private readonly frameSize: number;

  constructor(private readonly sampleRate: number) {
    this.frameSize = Math.max(1, Math.round(sampleRate * FRAME_SECONDS));
  }

  trim(left: Float32Array, right: Float32Array, options: SilenceTrimOptions): SilenceTrimResult {
    const length = Math.min(left.length, right.length);
    const frameRms = this.measureFrames(left, right, length);
    const threshold = this.resolveThreshold(frameRms, options.thresholdDb);
    const removed = threshold === null ? [] : this.findRemovedRanges(frameRms, threshold, length, options);

    if (removed.length === 0) {
      return this.untouched(left, right, length);
    }

    return this.build(left, right, length, removed, options);
  }

  private measureFrames(left: Float32Array, right: Float32Array, length: number): Float32Array {
    const frameCount = Math.ceil(length / this.frameSize);
    const rms = new Float32Array(frameCount);

    for (let frame = 0; frame < frameCount; frame++) {
      const start = frame * this.frameSize;
      const end = Math.min(start + this.frameSize, length);
      let sum = 0;

      for (let i = start; i < end; i++) {
        const l = left[i];
        const r = right[i];
        sum += l * l + r * r;
      }

      rms[frame] = Math.sqrt(sum / (2 * (end - start)));
    }

    return rms;
  }

  private resolveThreshold(frameRms: Float32Array, thresholdDb: number): number | null {
    if (frameRms.length === 0) {
      return null;
    }

    const sorted = Float32Array.from(frameRms).sort();
    const reference = sorted[Math.floor((sorted.length - 1) * REFERENCE_PERCENTILE)];

    if (reference < ABSOLUTE_FLOOR_RMS) {
      return null;
    }

    return Math.max(reference * Math.pow(10, -thresholdDb / 20), ABSOLUTE_FLOOR_RMS);
  }

  private findRemovedRanges(
    frameRms: Float32Array,
    threshold: number,
    length: number,
    options: SilenceTrimOptions,
  ): SampleRange[] {
    const frameCount = frameRms.length;
    const minFrames = Math.ceil(options.minSilenceSeconds / FRAME_SECONDS);
    const padding = Math.round(options.keepPaddingSeconds * this.sampleRate);
    const minRemovable = this.frameSize * 2;
    const ranges: SampleRange[] = [];

    for (const run of this.bridge(this.findQuietRuns(frameRms, threshold))) {
      if (run.end - run.start < minFrames) {
        continue;
      }

      const start = run.start === 0 ? 0 : run.start * this.frameSize + padding;
      const end = run.end === frameCount ? length : Math.min(run.end * this.frameSize, length) - padding;

      if (end - start >= minRemovable) {
        ranges.push({ start, end });
      }
    }

    return ranges;
  }

  private findQuietRuns(frameRms: Float32Array, threshold: number): FrameRun[] {
    const runs: FrameRun[] = [];
    let runStart = -1;

    for (let frame = 0; frame < frameRms.length; frame++) {
      const isQuiet = frameRms[frame] < threshold;

      if (isQuiet && runStart < 0) {
        runStart = frame;
      } else if (!isQuiet && runStart >= 0) {
        runs.push({ start: runStart, end: frame });
        runStart = -1;
      }
    }

    if (runStart >= 0) {
      runs.push({ start: runStart, end: frameRms.length });
    }

    return runs;
  }

  private bridge(runs: readonly FrameRun[]): FrameRun[] {
    const merged: FrameRun[] = [];

    for (const run of runs) {
      const last = merged[merged.length - 1];

      if (last !== undefined && run.start - last.end <= BRIDGE_FRAMES) {
        last.end = run.end;
      } else {
        merged.push({ start: run.start, end: run.end });
      }
    }

    return merged;
  }

  private build(
    left: Float32Array,
    right: Float32Array,
    length: number,
    removed: readonly SampleRange[],
    options: SilenceTrimOptions,
  ): SilenceTrimResult {
    const kept = this.complement(removed, length);
    const total = kept.reduce((sum, range) => sum + (range.end - range.start), 0);

    if (total === 0) {
      return this.untouched(left, right, length);
    }

    const outLeft = new Float32Array(total);
    const outRight = new Float32Array(total);
    const fade = Math.round(options.fadeSeconds * this.sampleRate);
    let offset = 0;
    let previousLength = 0;

    for (const range of kept) {
      const segmentLength = range.end - range.start;
      outLeft.set(left.subarray(range.start, range.end), offset);
      outRight.set(right.subarray(range.start, range.end), offset);

      if (offset > 0) {
        this.fadeJoin(outLeft, offset, previousLength, segmentLength, fade);
        this.fadeJoin(outRight, offset, previousLength, segmentLength, fade);
      }

      offset += segmentLength;
      previousLength = segmentLength;
    }

    return {
      left: outLeft,
      right: outRight,
      keptRanges: kept,
      removedRanges: removed,
      removedSeconds: (length - total) / this.sampleRate,
    };
  }

  private complement(removed: readonly SampleRange[], length: number): SampleRange[] {
    const kept: SampleRange[] = [];
    let cursor = 0;

    for (const range of removed) {
      if (range.start > cursor) {
        kept.push({ start: cursor, end: range.start });
      }
      cursor = range.end;
    }

    if (cursor < length) {
      kept.push({ start: cursor, end: length });
    }

    return kept;
  }

  private fadeJoin(
    channel: Float32Array,
    joinOffset: number,
    previousLength: number,
    nextLength: number,
    fade: number,
  ): void {
    const fadeOut = Math.min(fade, previousLength);
    const fadeIn = Math.min(fade, nextLength);

    for (let i = 0; i < fadeOut; i++) {
      channel[joinOffset - fadeOut + i] *= 1 - (i + 1) / fadeOut;
    }

    for (let i = 0; i < fadeIn; i++) {
      channel[joinOffset + i] *= (i + 1) / fadeIn;
    }
  }

  private untouched(left: Float32Array, right: Float32Array, length: number): SilenceTrimResult {
    return {
      left,
      right,
      keptRanges: [{ start: 0, end: length }],
      removedRanges: [],
      removedSeconds: 0,
    };
  }
}
