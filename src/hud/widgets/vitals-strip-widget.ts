// Ship Vitals strip: a compact right-aligned row of tiny vector icons (battery,
// CPU, RAM, uptime) tinted by theme.accent, each followed by a small mono value.
// Right-aligned — the row ends at origin.x and grows left, so it sits in the
// bottom-right corner below the soundwave. Drawn on the same canvas → burned in.

import type { SystemVitals, WidgetRenderContext } from "../types";
import { drawText } from "./text-primitives";

type IconKind = "battery" | "cpu" | "ram" | "clock";

interface Cell {
  icon: IconKind;
  value: string;
  charging?: boolean;
}

export function drawVitalsStrip(c: WidgetRenderContext): void {
  const v = c.state.vitals;
  if (!v) return; // disabled or not yet read → draw nothing

  const { ctx, origin, u, theme } = c;
  const iconH = 1.5 * u;
  const iconW = 2.1 * u; // uniform icon box keeps alignment simple
  const gapIconText = 0.5 * u;
  const gapCell = 1.6 * u;
  const textSize = 1.5 * u;
  const cy = origin.y;

  const cells = buildCells(v);
  if (!cells.length) return;

  // Measure with the value font so right-alignment is exact.
  ctx.save();
  ctx.font = `600 ${textSize}px ${theme.fontMono}`;
  const cellW = cells.map((cell) => iconW + gapIconText + ctx.measureText(cell.value).width);
  const total = cellW.reduce((a, b) => a + b, 0) + gapCell * (cells.length - 1);
  ctx.restore();

  if (v.stale) {
    ctx.save();
    ctx.globalAlpha = 0.4; // dim the whole strip when telemetry is stale
  }

  let x = origin.x - total; // left edge; row ends at origin.x
  cells.forEach((cell, i) => {
    drawIcon(ctx, cell.icon, x, cy, iconW, iconH, theme.accent, cell.charging);
    drawText(ctx, cell.value, x + iconW + gapIconText, cy, {
      font: theme.fontMono,
      size: textSize,
      color: theme.text,
      weight: 600,
      baseline: "middle",
      glow: 0.2 * u,
      glowColor: theme.accent,
    });
    x += cellW[i] + gapCell;
  });

  if (v.stale) ctx.restore();
}

// Battery cell is skipped entirely on machines without one (battery === null).
function buildCells(v: SystemVitals): Cell[] {
  const cells: Cell[] = [];
  if (v.battery != null) cells.push({ icon: "battery", value: `${v.battery}%`, charging: v.charging });
  cells.push({ icon: "cpu", value: `${v.cpu}%` });
  cells.push({ icon: "ram", value: `${v.mem}%` });
  cells.push({ icon: "clock", value: formatUptime(v.uptime) });
  return cells;
}

// Uptime → `HH:MM`, or `Dd HH:MM` once past 24h.
export function formatUptime(seconds: number): string {
  const totalMin = Math.floor(Math.max(0, seconds) / 60);
  const days = Math.floor(totalMin / (60 * 24));
  const h = Math.floor((totalMin % (60 * 24)) / 60);
  const m = totalMin % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return days > 0 ? `${days}d ${hh}:${mm}` : `${hh}:${mm}`;
}

function drawIcon(
  ctx: CanvasRenderingContext2D,
  kind: IconKind,
  x: number,
  cy: number,
  w: number,
  h: number,
  color: string,
  charging?: boolean,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, 0.12 * (h / 1.5)); // scale line weight with icon size
  const lw = ctx.lineWidth;

  if (kind === "battery") {
    const bw = w - 0.4 * lw - h * 0.18; // leave room for the nub
    const bh = h * 0.62;
    const top = cy - bh / 2;
    ctx.strokeRect(x, top, bw, bh);
    // terminal nub
    const nubH = bh * 0.45;
    ctx.fillRect(x + bw, cy - nubH / 2, h * 0.16, nubH);
    // charge level fill (or a bolt when charging)
    if (charging) {
      ctx.beginPath();
      ctx.moveTo(x + bw * 0.55, top + bh * 0.15);
      ctx.lineTo(x + bw * 0.3, cy + bh * 0.05);
      ctx.lineTo(x + bw * 0.5, cy + bh * 0.05);
      ctx.lineTo(x + bw * 0.35, top + bh * 0.9);
      ctx.lineTo(x + bw * 0.7, cy - bh * 0.05);
      ctx.lineTo(x + bw * 0.48, cy - bh * 0.05);
      ctx.closePath();
      ctx.fill();
    } else {
      const pad = lw + 0.5;
      ctx.fillRect(x + pad, top + pad, (bw - pad * 2) * 0.6, bh - pad * 2);
    }
  } else if (kind === "cpu") {
    const s = h * 0.62;
    const left = x + (w - s) / 2 - h * 0.1;
    const top = cy - s / 2;
    ctx.strokeRect(left, top, s, s);
    // inner die
    ctx.strokeRect(left + s * 0.28, top + s * 0.28, s * 0.44, s * 0.44);
    // pins (top/bottom/left/right)
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const t = left + s * (0.3 + i * 0.2);
      ctx.moveTo(t, top - s * 0.18);
      ctx.lineTo(t, top);
      ctx.moveTo(t, top + s);
      ctx.lineTo(t, top + s + s * 0.18);
      const v = top + s * (0.3 + i * 0.2);
      ctx.moveTo(left - s * 0.18, v);
      ctx.lineTo(left, v);
      ctx.moveTo(left + s, v);
      ctx.lineTo(left + s + s * 0.18, v);
    }
    ctx.stroke();
  } else if (kind === "ram") {
    const bw = w * 0.8;
    const left = x + (w - bw) / 2 - h * 0.1;
    const bh = h * 0.6;
    const top = cy - bh / 2;
    const rows = 3;
    const gap = bh / (rows * 2 - 1);
    for (let i = 0; i < rows; i++) {
      ctx.fillRect(left, top + i * gap * 2, bw, gap);
    }
  } else {
    // clock
    const r = h * 0.34;
    const ccx = x + w / 2 - h * 0.1;
    ctx.beginPath();
    ctx.arc(ccx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ccx, cy);
    ctx.lineTo(ccx, cy - r * 0.62); // minute hand
    ctx.moveTo(ccx, cy);
    ctx.lineTo(ccx + r * 0.5, cy); // hour hand
    ctx.stroke();
  }
  ctx.restore();
}
