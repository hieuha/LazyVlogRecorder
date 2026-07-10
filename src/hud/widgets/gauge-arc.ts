// Arc gauge widget (PRESSURE / OXYGEN / TEMP in the Martian layout):
// label, large value, unit, and a partial ring showing value within [min,max].
// Renders "--" when the value is null (offline first-launch, Phase 3 decision).

import type { GaugeMetric, WidgetRenderContext } from "../types";
import { drawText } from "./text-primitives";

const ARC_START = (-135 * Math.PI) / 180;
const ARC_SWEEP = (270 * Math.PI) / 180; // 270° dial

export function drawGaugeArc(
  c: WidgetRenderContext,
  spec: { metric: GaugeMetric; label: string; scale?: number },
): void {
  const { ctx, origin, theme, state } = c;
  // Uniform per-gauge size (all measurements below are in `u`); `scale` shrinks
  // or grows the whole gauge anchored at its origin. Default 1 = unchanged.
  const u = c.u * (spec.scale ?? 1);
  const g = state.gauges[spec.metric];
  const ox = origin.x;
  const oy = origin.y;

  // Label
  drawText(ctx, spec.label.toUpperCase(), ox, oy, {
    font: theme.fontMono,
    size: 1.5 * u,
    color: theme.muted,
    weight: 600,
    letterSpacing: 0.25 * u,
    baseline: "top",
  });

  // Value (large, holographic vertical gradient) + gold unit
  const valueText = g.value == null ? "--" : Math.round(g.value).toString();
  const valueY = oy + 2.6 * u;
  drawText(ctx, valueText, ox, valueY, {
    font: theme.fontCondensed,
    size: 5.4 * u,
    color: theme.text,
    gradient: [theme.accentBright, theme.textDim],
    weight: 500,
    baseline: "top",
    glow: 0.7 * u,
    glowColor: theme.accent, // halo matches the number's tone, not the base text color
  });
  const valueW = measure(ctx, valueText, `500 ${5.4 * u}px ${theme.fontCondensed}`);
  const unitX = ox + valueW + 0.8 * u;
  drawText(ctx, g.unit, unitX, valueY + 0.6 * u, {
    font: theme.fontMono,
    size: 1.6 * u,
    color: theme.gold,
    weight: 600,
    baseline: "top",
  });
  const unitW = measure(ctx, g.unit, `600 ${1.6 * u}px ${theme.fontMono}`);

  // Arc dial follows the value + unit width so the gap stays constant
  const r = 2.6 * u;
  const cx = unitX + unitW + 0.6 * u + r;
  const cy = valueY + 2.7 * u;
  const frac = fraction(g.value, g.min, g.max);
  drawDial(c, cx, cy, r, frac, 0.5 * u);
}

function drawDial(
  c: WidgetRenderContext,
  cx: number,
  cy: number,
  r: number,
  frac: number,
  lineWidth: number,
): void {
  const { ctx, theme } = c;
  ctx.save();
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  // track
  ctx.strokeStyle = theme.accentDeep;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, ARC_START, ARC_START + ARC_SWEEP);
  ctx.stroke();
  // value arc with a teal→bright gradient across the dial for a lit look
  ctx.globalAlpha = 1;
  const grad = ctx.createLinearGradient(cx - r, cy + r, cx + r, cy - r);
  grad.addColorStop(0, theme.accentDeep);
  grad.addColorStop(1, theme.accentBright);
  ctx.strokeStyle = grad;
  ctx.shadowColor = theme.accent;
  ctx.shadowBlur = lineWidth * 2.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, ARC_START, ARC_START + ARC_SWEEP * frac);
  ctx.stroke();
  ctx.restore();
}

function fraction(value: number | null, min: number, max: number): number {
  if (value == null || max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function measure(ctx: CanvasRenderingContext2D, text: string, font: string): number {
  ctx.save();
  ctx.font = font;
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}
