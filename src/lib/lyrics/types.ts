export interface LyricWord {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface LyricLine {
  readonly words: readonly LyricWord[];
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly rtl: boolean;
}

export interface TimeRange {
  readonly start: number;
  readonly end: number;
}

const RTL_PATTERN = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

export function isRtlText(text: string): boolean {
  return RTL_PATTERN.test(text);
}

export function createLine(words: readonly LyricWord[]): LyricLine {
  const text = words.map((word) => word.text).join(' ');
  const end = words.reduce((latest, word) => Math.max(latest, word.end), words[0].end);

  return { words, text, start: words[0].start, end, rtl: isRtlText(text) };
}

export function linesToText(lines: readonly LyricLine[]): string {
  return lines.map((line) => line.text).join('\n');
}

export function normalizeWord(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u200C\u200D]/g, '')
    .replace(/\u064A/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    .replace(/[\p{P}\p{S}]/gu, '')
    .toLowerCase();
}
