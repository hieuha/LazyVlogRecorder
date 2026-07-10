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

// Full-canvas horizontal scanlines (very subtle).
export function drawScanline(c: WidgetRenderContext): void {
  const { ctx, width, height, u, theme } = c;
  const gap = Math.max(2, Math.round(0.35 * u));
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = theme.scanline ?? "#bfe9ee";
  for (let y = 0; y < height; y += gap * 2) {
    ctx.fillRect(0, y, width, gap);
  }
  ctx.restore();
}

// Cinematic color grade over the webcam: a cool→warm diagonal wash (soft-light)
// plus a vignette (multiply). Unifies the frame's tone so the HUD reads as one
// composited image, giving the sci-fi "found footage" look.
export function drawColorGrade(c: WidgetRenderContext): void {
  const { ctx, width, height, theme } = c;
  ctx.save();

  // Tone wash: cool teal top-left → neutral → warm amber bottom-right.
  const wash = ctx.createLinearGradient(0, 0, width, height);
  wash.addColorStop(0, theme.gradeCool);
  wash.addColorStop(0.55, "rgba(8, 16, 22, 0.04)");
  wash.addColorStop(1, theme.gradeWarm);
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  // Vignette: brighten center, darken edges.
  const cx = width / 2;
  const cy = height / 2;
  const vig = ctx.createRadialGradient(
    cx,
    cy,
    Math.min(width, height) * 0.28,
    cx,
    cy,
    Math.max(width, height) * 0.72,
  );
  vig.addColorStop(0, "rgba(255, 255, 255, 1)");
  vig.addColorStop(1, "rgba(46, 58, 66, 1)");
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
}
