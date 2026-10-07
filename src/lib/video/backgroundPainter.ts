import type { VideoSize, VideoStyle } from './videoStyle';

export class BackgroundPainter {
  paint(ctx: CanvasRenderingContext2D, size: VideoSize, style: VideoStyle): void {
    switch (style.background) {
      case 'gradient':
        this.paintGradient(ctx, size, style);
        break;
      case 'image':
        this.paintImage(ctx, size, style);
        break;
      default:
        this.paintSolid(ctx, size, style.backgroundColor);
    }
  }

  private paintSolid(ctx: CanvasRenderingContext2D, size: VideoSize, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size.width, size.height);
  }

  private paintGradient(ctx: CanvasRenderingContext2D, size: VideoSize, style: VideoStyle): void {
    const radians = (style.gradientAngle * Math.PI) / 180;
    const dx = Math.sin(radians);
    const dy = -Math.cos(radians);
    const half = (Math.abs(size.width * dx) + Math.abs(size.height * dy)) / 2;
    const cx = size.width / 2;
    const cy = size.height / 2;
    const gradient = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);

    gradient.addColorStop(0, style.gradientFrom);
    gradient.addColorStop(1, style.gradientTo);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size.width, size.height);
  }

  private paintImage(ctx: CanvasRenderingContext2D, size: VideoSize, style: VideoStyle): void {
    const image = style.backgroundImage;
    this.paintSolid(ctx, size, style.backgroundColor);

    if (image === null) {
      return;
    }

    const scale = Math.max(size.width / image.width, size.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.drawImage(image, (size.width - width) / 2, (size.height - height) / 2, width, height);

    if (style.imageDim > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${style.imageDim})`;
      ctx.fillRect(0, 0, size.width, size.height);
    }
  }
}
