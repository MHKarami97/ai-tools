import type { LyricLine, LyricWord } from '@/lib/lyrics/types';
import { BackgroundPainter } from './backgroundPainter';
import type { TextAnimation, VideoSize, VideoStyle } from './videoStyle';

const LEAD_SECONDS = 0.15;
const ENTER_SECONDS = 0.25;
const HOLD_SECONDS = 1.2;
const EXIT_SECONDS = 0.3;
const CONTEXT_ALPHA = 0.35;
const UNSUNG_ALPHA = 0.55;
const WRAP_RATIO = 0.86;
const ROW_HEIGHT_RATIO = 1.6;
const SLIDE_RATIO = 0.6;
const CONTEXT_GAP_RATIO = 0.5;
const MIN_WORD_PROGRESS_SECONDS = 0.05;
const MAX_CROSSFADE_GAP_SECONDS = 2;

interface WordBox {
  readonly word: LyricWord;
  readonly width: number;
  readonly anchorX: number;
}

interface RowBox {
  readonly words: readonly WordBox[];
  readonly y: number;
}

interface LineLayout {
  readonly rows: readonly RowBox[];
  readonly height: number;
}

interface PaintTarget {
  readonly ctx: CanvasRenderingContext2D;
  readonly style: VideoStyle;
  readonly rtl: boolean;
  readonly rowHeight: number;
}

interface WordPainter {
  paint(target: PaintTarget, box: WordBox, y: number, time: number, alpha: number): void;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function wordProgress(word: LyricWord, time: number): number {
  return clamp01((time - word.start) / Math.max(word.end - word.start, MIN_WORD_PROGRESS_SECONDS));
}

function drawText(
  target: PaintTarget,
  text: string,
  x: number,
  y: number,
  color: string,
  alpha: number,
): void {
  target.ctx.globalAlpha = alpha;
  target.ctx.fillStyle = color;
  target.ctx.fillText(text, x, y);
}

class PlainPainter implements WordPainter {
  paint(target: PaintTarget, box: WordBox, y: number, _time: number, alpha: number): void {
    drawText(target, box.word.text, box.anchorX, y, target.style.textColor, alpha);
  }
}

class TypewriterPainter implements WordPainter {
  paint(target: PaintTarget, box: WordBox, y: number, time: number, alpha: number): void {
    const progress = wordProgress(box.word, time);
    if (time < box.word.start) {
      return;
    }

    const text = progress >= 1 ? box.word.text : this.reveal(box.word.text, progress);
    drawText(target, text, box.anchorX, y, target.style.textColor, alpha);
  }

  private reveal(text: string, progress: number): string {
    const characters = Array.from(text);
    const visible = Math.max(1, Math.ceil(characters.length * progress));
    return characters.slice(0, visible).join('');
  }
}

class KaraokePainter implements WordPainter {
  paint(target: PaintTarget, box: WordBox, y: number, time: number, alpha: number): void {
    const { style, ctx, rtl, rowHeight } = target;
    const progress = wordProgress(box.word, time);
    const sung = time >= box.word.end;

    if (sung) {
      drawText(target, box.word.text, box.anchorX, y, style.highlightColor, alpha);
      return;
    }

    drawText(target, box.word.text, box.anchorX, y, style.textColor, alpha * UNSUNG_ALPHA);

    if (time <= box.word.start) {
      return;
    }

    const filled = box.width * progress;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rtl ? box.anchorX - filled : box.anchorX, y - rowHeight / 2, filled, rowHeight);
    ctx.clip();
    drawText(target, box.word.text, box.anchorX, y, style.highlightColor, alpha);
    ctx.restore();
  }
}

const PAINTERS: Readonly<Record<TextAnimation, WordPainter>> = {
  none: new PlainPainter(),
  fade: new PlainPainter(),
  slide: new PlainPainter(),
  typewriter: new TypewriterPainter(),
  karaoke: new KaraokePainter(),
};

const PLAIN_PAINTER = new PlainPainter();
const CROSSFADE_ANIMATIONS: ReadonlySet<TextAnimation> = new Set(['fade', 'slide', 'karaoke']);
const ENTER_ANIMATIONS: ReadonlySet<TextAnimation> = new Set(['fade', 'slide', 'karaoke']);

export class LyricFrameRenderer {
  private readonly fontPx: number;
  private readonly rowHeight: number;
  private readonly font: string;
  private readonly background: HTMLCanvasElement;
  private readonly layouts = new Map<number, LineLayout>();

  constructor(
    private readonly size: VideoSize,
    private readonly style: VideoStyle,
    private readonly lines: readonly LyricLine[],
  ) {
    this.fontPx = Math.max(12, Math.round(Math.min(size.width, size.height) * style.fontScale));
    this.rowHeight = Math.round(this.fontPx * ROW_HEIGHT_RATIO);
    this.font = `${style.fontWeight} ${this.fontPx}px "${style.fontFamily}", Tahoma, sans-serif`;
    this.background = this.createBackground();
  }

  render(ctx: CanvasRenderingContext2D, time: number): void {
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.drawImage(this.background, 0, 0);

    const index = this.currentIndex(time);
    if (index < 0) {
      return;
    }

    const line = this.lines[index];
    const enter = clamp01((time - (line.start - LEAD_SECONDS)) / ENTER_SECONDS);
    const exit = 1 - clamp01((time - (line.end + HOLD_SECONDS)) / EXIT_SECONDS);
    if (exit <= 0) {
      return;
    }

    const animation = this.style.animation;
    const alpha = (ENTER_ANIMATIONS.has(animation) ? enter : 1) * exit;
    const layout = this.layoutFor(ctx, index);
    const top = (this.size.height - layout.height) / 2;
    const offsetY = animation === 'slide' ? (1 - this.easeOut(enter)) * this.fontPx * SLIDE_RATIO : 0;

    this.applyTextState(ctx);

    if (this.style.showContext) {
      this.drawContext(ctx, index, top, layout.height, exit, time);
    } else if (CROSSFADE_ANIMATIONS.has(animation) && enter < 1) {
      this.drawOutgoing(ctx, index, enter, time);
    }

    this.drawLine(ctx, index, top + offsetY, PAINTERS[animation], alpha, time);
    this.resetTextState(ctx);
  }

  private drawOutgoing(ctx: CanvasRenderingContext2D, index: number, enter: number, time: number): void {
    const previous = index - 1;
    if (previous < 0 || this.lines[index].start - this.lines[previous].end > MAX_CROSSFADE_GAP_SECONDS) {
      return;
    }

    const layout = this.layoutFor(ctx, previous);
    const previousTop = (this.size.height - layout.height) / 2;
    this.drawLine(ctx, previous, previousTop, PLAIN_PAINTER, 1 - enter, time);
  }

  private drawContext(
    ctx: CanvasRenderingContext2D,
    index: number,
    top: number,
    height: number,
    exit: number,
    time: number,
  ): void {
    const gap = this.rowHeight * CONTEXT_GAP_RATIO;
    const alpha = CONTEXT_ALPHA * exit;

    if (index > 0) {
      const previous = this.layoutFor(ctx, index - 1);
      this.drawLine(ctx, index - 1, top - gap - previous.height, PLAIN_PAINTER, alpha, time);
    }

    if (index < this.lines.length - 1) {
      this.drawLine(ctx, index + 1, top + height + gap, PLAIN_PAINTER, alpha, time);
    }
  }

  private drawLine(
    ctx: CanvasRenderingContext2D,
    index: number,
    top: number,
    painter: WordPainter,
    alpha: number,
    time: number,
  ): void {
    const layout = this.layoutFor(ctx, index);
    const target: PaintTarget = {
      ctx,
      style: this.style,
      rtl: this.lines[index].rtl,
      rowHeight: this.rowHeight,
    };

    this.applyDirection(ctx, target.rtl);

    for (const row of layout.rows) {
      const y = top + row.y + this.rowHeight / 2;
      for (const box of row.words) {
        painter.paint(target, box, y, time, alpha);
      }
    }
  }

  private layoutFor(ctx: CanvasRenderingContext2D, index: number): LineLayout {
    const cached = this.layouts.get(index);
    if (cached !== undefined) {
      return cached;
    }

    const line = this.lines[index];
    ctx.font = this.font;
    this.applyDirection(ctx, line.rtl);

    const space = ctx.measureText(' ').width;
    const maxWidth = this.size.width * WRAP_RATIO;
    const measured = line.words.map((word) => ({ word, width: ctx.measureText(word.text).width }));
    const groups = this.wrap(measured, space, maxWidth);
    const rows = groups.map((group, rowIndex) => this.placeRow(group, rowIndex, space, line.rtl));
    const layout: LineLayout = { rows, height: rows.length * this.rowHeight };

    this.layouts.set(index, layout);
    return layout;
  }

  private wrap(
    measured: ReadonlyArray<{ word: LyricWord; width: number }>,
    space: number,
    maxWidth: number,
  ): Array<Array<{ word: LyricWord; width: number }>> {
    const groups: Array<Array<{ word: LyricWord; width: number }>> = [];
    let current: Array<{ word: LyricWord; width: number }> = [];
    let currentWidth = 0;

    for (const item of measured) {
      const nextWidth = current.length === 0 ? item.width : currentWidth + space + item.width;

      if (current.length > 0 && nextWidth > maxWidth) {
        groups.push(current);
        current = [];
        currentWidth = 0;
      }

      currentWidth = current.length === 0 ? item.width : currentWidth + space + item.width;
      current.push(item);
    }

    if (current.length > 0) {
      groups.push(current);
    }

    return groups;
  }

  private placeRow(
    group: ReadonlyArray<{ word: LyricWord; width: number }>,
    rowIndex: number,
    space: number,
    rtl: boolean,
  ): RowBox {
    const rowWidth = group.reduce((sum, item) => sum + item.width, 0) + space * (group.length - 1);
    let cursor = rtl ? (this.size.width + rowWidth) / 2 : (this.size.width - rowWidth) / 2;
    const words: WordBox[] = [];

    for (const item of group) {
      words.push({ word: item.word, width: item.width, anchorX: cursor });
      cursor += rtl ? -(item.width + space) : item.width + space;
    }

    return { words, y: rowIndex * this.rowHeight };
  }

  private currentIndex(time: number): number {
    let low = 0;
    let high = this.lines.length - 1;
    let found = -1;

    while (low <= high) {
      const middle = (low + high) >> 1;
      if (this.lines[middle].start - LEAD_SECONDS <= time) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    return found;
  }

  private applyTextState(ctx: CanvasRenderingContext2D): void {
    ctx.font = this.font;
    ctx.textBaseline = 'middle';

    if (this.style.textShadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = this.fontPx * 0.15;
      ctx.shadowOffsetY = this.fontPx * 0.04;
    }
  }

  private resetTextState(ctx: CanvasRenderingContext2D): void {
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.globalAlpha = 1;
  }

  private applyDirection(ctx: CanvasRenderingContext2D, rtl: boolean): void {
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = rtl ? 'right' : 'left';
  }

  private easeOut(value: number): number {
    return 1 - Math.pow(1 - value, 3);
  }

  private createBackground(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.size.width;
    canvas.height = this.size.height;

    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('ساخت بوم رسم ممکن نیست.');
    }

    new BackgroundPainter().paint(context, this.size, this.style);
    return canvas;
  }
}
