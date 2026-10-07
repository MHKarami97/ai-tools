import type { LyricWord } from './types';

const FRAME_SECONDS = 0.01;
const REFERENCE_PERCENTILE = 0.95;
const THRESHOLD_DB = 30;
const TAIL_SECONDS = 0.06;
const MIN_WORD_SECONDS = 0.06;
const ABSOLUTE_FLOOR_RMS = 1e-4;

export class WordTimingRefiner {
  private readonly envelope: Float32Array;
  private readonly threshold: number | null;

  constructor(
    samples: Float32Array,
    private readonly sampleRate: number,
    private readonly offsetSeconds: number,
  ) {
    this.envelope = this.measure(samples);
    this.threshold = this.resolveThreshold();
  }

  refine(words: readonly LyricWord[]): LyricWord[] {
    if (this.threshold === null) {
      return [...words];
    }

    return words.map((word) => this.refineEnd(word, this.threshold as number));
  }

  private refineEnd(word: LyricWord, threshold: number): LyricWord {
    const first = Math.max(0, this.frameOf(word.start));
    const last = Math.min(this.frameOf(word.end), this.envelope.length - 1);

    for (let frame = last; frame >= first; frame--) {
      if (this.envelope[frame] >= threshold) {
        const refinedEnd = this.offsetSeconds + (frame + 1) * FRAME_SECONDS + TAIL_SECONDS;
        const end = Math.max(word.start + MIN_WORD_SECONDS, Math.min(word.end, refinedEnd));
        return end < word.end ? { text: word.text, start: word.start, end } : word;
      }
    }

    return word;
  }

  private frameOf(time: number): number {
    return Math.floor((time - this.offsetSeconds) / FRAME_SECONDS);
  }

  private measure(samples: Float32Array): Float32Array {
    const frameSize = Math.max(1, Math.round(this.sampleRate * FRAME_SECONDS));
    const frameCount = Math.ceil(samples.length / frameSize);
    const rms = new Float32Array(frameCount);

    for (let frame = 0; frame < frameCount; frame++) {
      const start = frame * frameSize;
      const end = Math.min(start + frameSize, samples.length);
      let sum = 0;

      for (let i = start; i < end; i++) {
        sum += samples[i] * samples[i];
      }

      rms[frame] = Math.sqrt(sum / (end - start));
    }

    return rms;
  }

  private resolveThreshold(): number | null {
    if (this.envelope.length === 0) {
      return null;
    }

    const sorted = Float32Array.from(this.envelope).sort();
    const reference = sorted[Math.floor((sorted.length - 1) * REFERENCE_PERCENTILE)];

    if (reference < ABSOLUTE_FLOOR_RMS) {
      return null;
    }

    return Math.max(reference * Math.pow(10, -THRESHOLD_DB / 20), ABSOLUTE_FLOOR_RMS);
  }
}
