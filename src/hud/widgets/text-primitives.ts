// Shared canvas text helpers used by HUD widgets. Keeps per-widget files small
// and drawing style consistent (font, letter-spacing, glow).

export interface TextStyle {
  font: string;
  size: number; // px
  color: string;
  /** Vertical gradient [top, bottom] fill for a holographic sheen; overrides color. */
  gradient?: [string, string];
  weight?: number | string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  letterSpacing?: number; // px
  glow?: number; // shadow blur px
  /** Halo color for the glow; defaults to the fill (gradient top when gradient-filled). */
  glowColor?: string;
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  s: TextStyle,
): void {
  ctx.save();
  ctx.font = `${s.weight ?? 400} ${s.size}px ${s.font}`;
  ctx.fillStyle = s.gradient ? verticalGradient(ctx, x, y, s) : s.color;
  ctx.textAlign = s.align ?? "left";
  ctx.textBaseline = s.baseline ?? "alphabetic";
  // letterSpacing is supported in modern WebKit/Chromium; guard for safety.
  if (s.letterSpacing != null && "letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${s.letterSpacing}px`;
  }
  if (s.glow) {
    // Match the glyph tone: prefer an explicit glow color, else the gradient
    // top, else the solid fill — so a gradient-filled number never haloes with
    // its unused base `color`.
    ctx.shadowColor = s.glowColor ?? (s.gradient ? s.gradient[0] : s.color);
    ctx.shadowBlur = s.glow;
  }
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function pad2(n: number): string {
  return Math.trunc(n).toString().padStart(2, "0");
}

// Build a vertical gradient spanning the glyph height for the given baseline.
function verticalGradient(
  ctx: CanvasRenderingContext2D,
  _x: number,
  y: number,
  s: TextStyle,
): CanvasGradient {
  const [top, bottom] = s.gradient!;
  let y0: number;
  let y1: number;
  if (s.baseline === "top") {
    y0 = y;
    y1 = y + s.size;
  } else if (s.baseline === "middle") {
    y0 = y - s.size / 2;
    y1 = y + s.size / 2;
  } else {
    y0 = y - s.size * 0.75;
    y1 = y + s.size * 0.12;
  }
  const grad = ctx.createLinearGradient(0, y0, 0, y1);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  return grad;
}
