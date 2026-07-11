// Decorative frame widgets: corner brackets and a faint scanline wash that give
// the HUD its sci-fi feel. Purely cosmetic; anchored per spec.

import type { WidgetRenderContext } from "../types";

// L-shaped corner bracket. Orientation derived from the anchor quadrant.
export function drawCornerFrame(c: WidgetRenderContext, anchor: string): void {
  const { ctx, origin, u, theme } = c;
  const len = 5 * u;
  const dirX = anchor.includes("right") ? -1 : 1;
  const dirY = anchor.includes("bottom") ? -1 : 1;
  ctx.save();
  ctx.strokeStyle = theme.accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.25 * u;
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y + dirY * len);
  ctx.lineTo(origin.x, origin.y);
  ctx.lineTo(origin.x + dirX * len, origin.y);
  ctx.stroke();
  ctx.restore();
}

// Full-canvas horizontal scanlines (very subtle). Cached as a small repeating
// tile + one pattern fill instead of ~height/gap `fillRect` calls per frame.
let scanTile: HTMLCanvasElement | null = null;
let scanGap = 0;
let scanColor = "";
function scanlineTile(gap: number, color: string): HTMLCanvasElement {
  if (!scanTile || scanGap !== gap || scanColor !== color) {
    scanTile = scanTile ?? document.createElement("canvas");
    scanTile.width = 1;
    scanTile.height = gap * 2;
    const t = scanTile.getContext("2d")!;
    t.clearRect(0, 0, 1, gap * 2);
    t.fillStyle = color;
    t.fillRect(0, 0, 1, gap); // line on the top half, gap on the bottom
    scanGap = gap;
    scanColor = color;
  }
  return scanTile;
}

export function drawScanline(c: WidgetRenderContext): void {
  const { ctx, width, height, u, theme } = c;
  const gap = Math.max(2, Math.round(0.35 * u));
  const pattern = ctx.createPattern(scanlineTile(gap, theme.scanline ?? "#bfe9ee"), "repeat");
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// Cinematic color grade over the webcam: a cool→warm diagonal wash (soft-light)
// plus a vignette (multiply). Unifies the frame's tone so the HUD reads as one
// composited image, giving the sci-fi "found footage" look.
// The wash + vignette gradients only depend on size + theme, so build them once
// and reuse — creating two gradients per frame was pure overhead.
let gradeWash: CanvasGradient | null = null;
let gradeVig: CanvasGradient | null = null;
let gradeKey = "";
function ensureGradeGradients(ctx: CanvasRenderingContext2D, width: number, height: number, theme: WidgetRenderContext["theme"]): void {
  const key = `${width}x${height}|${theme.gradeCool}|${theme.gradeWarm}`;
  if (key === gradeKey && gradeWash && gradeVig) return;
  const wash = ctx.createLinearGradient(0, 0, width, height);
  wash.addColorStop(0, theme.gradeCool);
  wash.addColorStop(0.55, "rgba(8, 16, 22, 0.04)");
  wash.addColorStop(1, theme.gradeWarm);
  const cx = width / 2;
  const cy = height / 2;
  const vig = ctx.createRadialGradient(
    cx, cy, Math.min(width, height) * 0.28, cx, cy, Math.max(width, height) * 0.72,
  );
  vig.addColorStop(0, "rgba(255, 255, 255, 1)");
  vig.addColorStop(1, "rgba(46, 58, 66, 1)");
  gradeWash = wash;
  gradeVig = vig;
  gradeKey = key;
}

export function drawColorGrade(c: WidgetRenderContext): void {
  const { ctx, width, height, theme } = c;
  ensureGradeGradients(ctx, width, height, theme);
  ctx.save();
  // Tone wash: cool teal top-left → neutral → warm amber bottom-right.
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = gradeWash!;
  ctx.fillRect(0, 0, width, height);
  // Vignette: brighten center, darken edges.
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = gradeVig!;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
