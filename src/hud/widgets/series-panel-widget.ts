// Time-series rows pushed via POST /series, each rendered as a labelled
// sparkline: LABEL  <mini line>  VALUE unit. Right-aligned on the HUD. The line
// auto-scales to the min/max of its buffered points. Stale rows are dimmed.

import type { WidgetRenderContext } from "../types";
import { drawText } from "./text-primitives";

export function drawSeriesPanel(c: WidgetRenderContext): void {
  const { ctx, origin, u, theme, state } = c;
  const series = state.series;
  if (!series || series.length === 0) return;

  const rowH = 3.4 * u;
  const size = 1.8 * u;
  const gap = 1.2 * u;
  const sparkW = 13 * u;
  const sparkH = 2 * u;

  series.forEach((s, i) => {
    const y = origin.y + i * rowH;
    const dim = s.stale === true;
    const valueText = s.unit ? `${s.value} ${s.unit}` : s.value;

    // Value column, right-aligned to the panel edge.
    drawText(ctx, valueText, origin.x, y, {
      font: theme.fontMono,
      size,
      color: dim ? theme.muted : theme.text,
      weight: 600,
      align: "right",
      baseline: "top",
      letterSpacing: 0.05 * u,
      glow: dim ? 0 : 0.3 * u,
    });

    ctx.save();
    ctx.font = `600 ${size}px ${theme.fontMono}`;
    const valueW = ctx.measureText(valueText).width;
    ctx.restore();

    const sparkRight = origin.x - valueW - gap;
    const sparkLeft = sparkRight - sparkW;
    drawSparkline(c, s.points, sparkLeft, y, sparkW, sparkH, dim);

    // Label, right-aligned just left of the sparkline.
    drawText(ctx, s.label.toUpperCase(), sparkLeft - gap, y, {
      font: theme.fontMono,
      size,
      color: dim ? theme.muted : theme.accent,
      weight: 600,
      align: "right",
      baseline: "top",
      letterSpacing: 0.1 * u,
    });
  });
}

function drawSparkline(
  c: WidgetRenderContext,
  points: number[],
  x0: number,
  y0: number,
  w: number,
  h: number,
  dim: boolean,
): void {
  const { ctx, u, theme } = c;
  if (points.length < 2) return;

  let min = Math.min(...points);
  let max = Math.max(...points);
  if (max - min < 1e-9) {
    min -= 1;
    max += 1;
  }
  const n = points.length;

  ctx.save();
  ctx.beginPath();
  points.forEach((v, i) => {
    const px = x0 + (i / (n - 1)) * w;
    const py = y0 + h - ((v - min) / (max - min)) * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = dim ? theme.muted : theme.accentBright;
  ctx.lineWidth = Math.max(1, 0.12 * u);
  ctx.lineJoin = "round";
  if (!dim) {
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 0.4 * u;
  }
  ctx.stroke();
  ctx.restore();

  // Dot on the latest point.
  const lastPx = x0 + w;
  const lastPy = y0 + h - ((points[n - 1] - min) / (max - min)) * h;
  ctx.save();
  ctx.fillStyle = dim ? theme.muted : theme.text;
  ctx.beginPath();
  ctx.arc(lastPx, lastPy, 0.28 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
