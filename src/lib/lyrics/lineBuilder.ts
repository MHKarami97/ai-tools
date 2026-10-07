import { createLine, type LyricLine, type LyricWord } from './types';

export interface LineBuildOptions {
  readonly maxWordsPerLine: number;
  readonly maxGapSeconds: number;
}

export const DEFAULT_LINE_OPTIONS: LineBuildOptions = {
  maxWordsPerLine: 5,
  maxGapSeconds: 0.8,
};

const SENTENCE_END = /[.!?\u061F\u2026]$/;

export class LineBuilder {
  build(words: readonly LyricWord[], options: LineBuildOptions = DEFAULT_LINE_OPTIONS): LyricLine[] {
    const lines: LyricLine[] = [];
    let current: LyricWord[] = [];

    for (const word of words) {
      if (current.length > 0 && this.shouldBreak(current, word, options)) {
        lines.push(createLine(current));
        current = [];
      }
      current.push(word);
    }

    if (current.length > 0) {
      lines.push(createLine(current));
    }

    return lines;
  }

  private shouldBreak(current: readonly LyricWord[], next: LyricWord, options: LineBuildOptions): boolean {
    const last = current[current.length - 1];

    return (
      current.length >= options.maxWordsPerLine ||
      next.start - last.end > options.maxGapSeconds ||
      SENTENCE_END.test(last.text)
    );
  }
}
