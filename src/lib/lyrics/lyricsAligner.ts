import { createLine, normalizeWord, type LyricLine, type LyricWord, type TimeRange } from './types';

interface Matching {
  readonly anchors: Array<LyricWord | null>;
  readonly exactRatio: number;
}

interface Token {
  readonly text: string;
  readonly key: string;
  readonly line: number;
}

const MIN_WORD_SECONDS = 0.25;
const MIN_EXACT_RATIO = 0.3;
const WHITESPACE = /\s+/;
const LINE_BREAK = /\r?\n/;

export class LyricsAligner {
  align(original: readonly LyricWord[], editedText: string, range: TimeRange): LyricLine[] {
    const tokens = this.tokenize(editedText);

    if (tokens.length === 0) {
      return [];
    }

    const blank = new Array<LyricWord | null>(tokens.length).fill(null);

    if (original.length === 0) {
      return this.groupLines(tokens, this.interpolate(tokens, blank, range));
    }

    const matching = this.matchAnchors(original, tokens);

    if (matching.exactRatio < MIN_EXACT_RATIO) {
      const sungSpan = { start: original[0].start, end: original[original.length - 1].end };
      return this.groupLines(tokens, this.interpolate(tokens, blank, sungSpan));
    }

    return this.groupLines(tokens, this.interpolate(tokens, matching.anchors, range));
  }

  private tokenize(text: string): Token[] {
    const tokens: Token[] = [];

    text.split(LINE_BREAK).forEach((line, lineIndex) => {
      for (const word of line.trim().split(WHITESPACE)) {
        if (word.length > 0) {
          tokens.push({ text: word, key: normalizeWord(word), line: lineIndex });
        }
      }
    });

    return tokens;
  }

  private matchAnchors(original: readonly LyricWord[], tokens: readonly Token[]): Matching {
    const rows = original.length;
    const columns = tokens.length;
    const stride = columns + 1;
    const keys = original.map((word) => normalizeWord(word.text));
    const cost = new Uint16Array((rows + 1) * stride);

    for (let j = 0; j <= columns; j++) cost[j] = j;
    for (let i = 0; i <= rows; i++) cost[i * stride] = i;

    for (let i = 1; i <= rows; i++) {
      for (let j = 1; j <= columns; j++) {
        const substitution = cost[(i - 1) * stride + j - 1] + (keys[i - 1] === tokens[j - 1].key ? 0 : 1);
        const deletion = cost[(i - 1) * stride + j] + 1;
        const insertion = cost[i * stride + j - 1] + 1;
        cost[i * stride + j] = Math.min(substitution, deletion, insertion);
      }
    }

    return this.backtrace(cost, stride, original, tokens, keys);
  }

  private backtrace(
    cost: Uint16Array,
    stride: number,
    original: readonly LyricWord[],
    tokens: readonly Token[],
    keys: readonly string[],
  ): Matching {
    const anchors = new Array<LyricWord | null>(tokens.length).fill(null);
    let exact = 0;
    let i = original.length;
    let j = tokens.length;

    while (i > 0 && j > 0) {
      const current = cost[i * stride + j];
      const isMatch = keys[i - 1] === tokens[j - 1].key;
      const diagonal = cost[(i - 1) * stride + j - 1] + (isMatch ? 0 : 1);

      if (isMatch && current === diagonal) {
        anchors[j - 1] = original[i - 1];
        exact++;
        i--;
        j--;
      } else if (current === cost[i * stride + j - 1] + 1) {
        j--;
      } else if (current === diagonal) {
        anchors[j - 1] = original[i - 1];
        i--;
        j--;
      } else {
        i--;
      }
    }

    return { anchors, exactRatio: exact / Math.max(1, Math.min(original.length, tokens.length)) };
  }

  private interpolate(
    tokens: readonly Token[],
    anchors: ReadonlyArray<LyricWord | null>,
    range: TimeRange,
  ): LyricWord[] {
    const result: LyricWord[] = new Array(tokens.length);
    let index = 0;
    let cursor = range.start;

    while (index < tokens.length) {
      const anchor = anchors[index];

      if (anchor !== null) {
        result[index] = { text: tokens[index].text, start: anchor.start, end: anchor.end };
        cursor = anchor.end;
        index++;
        continue;
      }

      let runEnd = index;
      while (runEnd < tokens.length && anchors[runEnd] === null) runEnd++;

      const next = anchors[runEnd];
      const nextStart = next ? next.start : Math.max(range.end, cursor);
      const count = runEnd - index;
      const slot = Math.max(nextStart - cursor, count * MIN_WORD_SECONDS) / count;

      for (let k = 0; k < count; k++) {
        const start = cursor + k * slot;
        result[index + k] = { text: tokens[index + k].text, start, end: start + slot };
      }

      cursor = result[runEnd - 1].end;
      index = runEnd;
    }

    return result;
  }

  private groupLines(tokens: readonly Token[], words: readonly LyricWord[]): LyricLine[] {
    const lines: LyricLine[] = [];
    let group: LyricWord[] = [];
    let currentLine = tokens[0].line;

    words.forEach((word, index) => {
      if (tokens[index].line !== currentLine && group.length > 0) {
        lines.push(createLine(group));
        group = [];
      }
      currentLine = tokens[index].line;
      group.push(word);
    });

    if (group.length > 0) {
      lines.push(createLine(group));
    }

    return lines;
  }
}
