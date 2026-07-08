// Right-side panel of external sensor readings pushed via the local HTTP API.
// Each row: LABEL (accent, right-aligned column) + VALUE unit (bright column,
// right-aligned to the panel edge). Stale rows are dimmed. Nothing renders when
// no readings have arrived.

import type { WidgetRenderContext } from "../types";
import { drawText } from "./text-primitives";

export function drawSensorPanel(c: WidgetRenderContext): void {
  const { ctx, origin, u, theme, state } = c;
  const items = state.sensors;
  if (!items || items.length === 0) return;

  const rowH = 2.6 * u;
  const size = 1.8 * u;
  const gap = 1.4 * u;

  const valueText = (i: number) => {
    const it = items[i];
    return it.unit ? `${it.value} ${it.unit}` : it.value;
  };

  // Align the label column by the widest value, so both columns are right-aligned.
  ctx.save();
  ctx.font = `600 ${size}px ${theme.fontMono}`;
  let maxValueW = 0;
  for (let i = 0; i < items.length; i++) {
    maxValueW = Math.max(maxValueW, ctx.measureText(valueText(i)).width);
  }
  ctx.restore();

  items.forEach((it, i) => {
    const y = origin.y + i * rowH;
    const dim = it.stale === true;

    drawText(ctx, valueText(i), origin.x, y, {
      font: theme.fontMono,
      size,
      color: dim ? theme.muted : theme.text,
      weight: 600,
      align: "right",
      baseline: "top",
      letterSpacing: 0.05 * u,
      glow: dim ? 0 : 0.3 * u,
    });

    drawText(ctx, it.label.toUpperCase(), origin.x - maxValueW - gap, y, {
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
