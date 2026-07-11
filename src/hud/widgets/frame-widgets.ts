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

// Full-canvas grid mesh (very subtle) — a fine woven texture over the whole
// frame. Cached as a small square repeating tile (a 1px line on the top + left
// edges → a grid when tiled) + one pattern fill, instead of many per-frame draws.
let scanTile: HTMLCanvasElement | null = null;
let scanGap = 0;
let scanColor = "";
function gridTile(cell: number, color: string): HTMLCanvasElement {
  if (!scanTile || scanGap !== cell || scanColor !== color) {
    scanTile = scanTile ?? document.createElement("canvas");
    scanTile.width = cell;
    scanTile.height = cell;
    const t = scanTile.getContext("2d")!;
    t.clearRect(0, 0, cell, cell);
    t.fillStyle = color;
    t.fillRect(0, 0, cell, 1); // top edge → horizontal grid lines
    t.fillRect(0, 0, 1, cell); // left edge → vertical grid lines
    scanGap = cell;
    scanColor = color;
  }
  return scanTile;
}

export function drawScanline(c: WidgetRenderContext): void {
  const { ctx, width, height, u, theme } = c;
  const cell = Math.max(3, Math.round(0.5 * u)); // grid cell size
  const pattern = ctx.createPattern(gridTile(cell, theme.scanline ?? "#bfe9ee"), "repeat");
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = 0.06;
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
