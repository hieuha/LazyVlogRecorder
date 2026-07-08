// Live mic soundwave: thin vertical bars mirrored about a center line, driven by
// real-time audio amplitude (state.audioBars). Right-aligned: the band ends at
// the resolved origin.x and extends left, so it sits cleanly in a corner.
// Rendered on the same canvas so it is burned into the recording.

import type { WidgetRenderContext } from "../types";

export function drawSoundwave(c: WidgetRenderContext, widthPct: number): void {
  const { ctx, origin, width, u, theme, state } = c;
  const bars = state.audioBars ?? null;
  const n = bars?.length ?? 56;

  const bandW = width * widthPct;
  const right = origin.x; // band ends here
  const left = right - bandW;
  const cy = origin.y;
  const barPitch = bandW / n;
  const barW = Math.max(1, barPitch * 0.32); // thin bars
  const maxH = 4 * u;

  ctx.save();

  // Center line (thin)
  ctx.strokeStyle = theme.accent;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = Math.max(1, 0.06 * u);
  ctx.beginPath();
  ctx.moveTo(left, cy);
  ctx.lineTo(right, cy);
  ctx.stroke();

  // Bars (subtle glow so they stay crisp)
  ctx.globalAlpha = 1;
  ctx.shadowColor = theme.accent;
  ctx.shadowBlur = 0.25 * u;
  for (let i = 0; i < n; i++) {
    const level = bars ? bars[i] : 0.012;
    const h = Math.max(0.3 * u, level * maxH);
    const x = left + i * barPitch;
    const grad = ctx.createLinearGradient(0, cy - h, 0, cy + h);
    grad.addColorStop(0, theme.accentBright);
    grad.addColorStop(0.5, theme.accent);
    grad.addColorStop(1, theme.accentDeep);
    ctx.fillStyle = grad;
    ctx.fillRect(x, cy - h, barW, h * 2);
  }

  ctx.restore();
}
