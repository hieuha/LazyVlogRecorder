// Text readout widgets for the Martian layout. Grouped in one file since they
// share the same concern (styled text blocks); the engine dispatches per type.

import type { WidgetRenderContext } from "../types";
import { drawText, pad2 } from "./text-primitives";

// MISSION DAY label + the date shown on a backlit dot-matrix / LCD panel:
// a light gridded panel with dark digits (top-left of the film HUD).
export function drawMissionDay(c: WidgetRenderContext): void {
  const { ctx, origin, u, theme, state } = c;
  drawText(ctx, "MISSION DAY", origin.x, origin.y, {
    font: theme.fontMono,
    size: 1.6 * u,
    color: theme.muted,
    weight: 600,
    letterSpacing: 0.2 * u,
    baseline: "top",
  });

  const boxY = origin.y + 3.4 * u; // clearer gap below the MISSION DAY label
  const label = state.dateText;
  const size = 3.4 * u;

  ctx.save();
  ctx.font = `700 ${size}px ${theme.fontCondensed}`;
  const w = ctx.measureText(label).width + 2.4 * u;
  const h = size + 1.4 * u;

  // Backlit panel fill (theme-driven; cool white in the film, dark amber in the
  // CRT theme), slightly darker toward the bottom.
  const bg = ctx.createLinearGradient(origin.x, boxY, origin.x, boxY + h);
  bg.addColorStop(0, theme.panelBg ?? "rgba(216, 228, 230, 0.95)");
  bg.addColorStop(1, theme.panelBgDeep ?? "rgba(180, 197, 201, 0.95)");
  ctx.fillStyle = bg;
  ctx.fillRect(origin.x, boxY, w, h);

  // Fine grid mesh (the dot-matrix texture), clipped to the panel.
  ctx.save();
  ctx.beginPath();
  ctx.rect(origin.x, boxY, w, h);
  ctx.clip();
  ctx.strokeStyle = theme.panelGrid ?? "rgba(38, 58, 68, 0.20)";
  ctx.lineWidth = Math.max(1, 0.05 * u);
  ctx.beginPath();
  const step = 0.32 * u;
  for (let x = origin.x; x <= origin.x + w; x += step) {
    ctx.moveTo(x, boxY);
    ctx.lineTo(x, boxY + h);
  }
  for (let y = boxY; y <= boxY + h; y += step) {
    ctx.moveTo(origin.x, y);
    ctx.lineTo(origin.x + w, y);
  }
  ctx.stroke();
  ctx.restore();

  // Panel border.
  ctx.strokeStyle = theme.text;
  ctx.lineWidth = 0.22 * u;
  ctx.strokeRect(origin.x, boxY, w, h);
  ctx.restore();

  // Panel digits (dark on the film's light panel; lit amber on the CRT panel).
  drawText(ctx, label, origin.x + 1.2 * u, boxY + h / 2, {
    font: theme.fontCondensed,
    size,
    color: theme.panelInk ?? "rgba(14, 28, 40, 0.96)",
    weight: 700,
    baseline: "middle",
  });
}

// TIME hh mm (top-right, right-aligned). DATE lives in the MISSION DAY block.
export function drawClock(c: WidgetRenderContext): void {
  const { ctx, origin, u, theme, state } = c;
  const t = `TIME  ${pad2(state.clock.h)}:${pad2(state.clock.m)}:${pad2(state.clock.s)}`;
  drawText(ctx, t, origin.x, origin.y, {
    font: theme.fontMono,
    size: 1.9 * u,
    color: theme.text,
    weight: 600,
    align: "right",
    baseline: "top",
    letterSpacing: 0.15 * u,
    glow: 0.4 * u,
  });
}

// LOG ENTRY > NAME #n (top-right, under the clock).
export function drawLogEntry(c: WidgetRenderContext): void {
  const { ctx, origin, u, theme, state } = c;
  const text = `LOG ENTRY > ${state.personName.toUpperCase()} #${state.logNo}`;
  drawText(ctx, text, origin.x, origin.y, {
    font: theme.fontMono,
    size: 1.9 * u,
    color: theme.accent,
    weight: 600,
    align: "right",
    baseline: "top",
    letterSpacing: 0.12 * u,
  });
}

// ENVIRONMENT label + weather-code text (under the gauges).
export function drawEnvironment(c: WidgetRenderContext): void {
  const { ctx, origin, u, theme, state } = c;
  drawText(ctx, state.environment.toUpperCase(), origin.x, origin.y, {
    font: theme.fontMono,
    size: 1.5 * u,
    color: theme.text,
    weight: 500,
    baseline: "top",
    letterSpacing: 0.14 * u,
  });
  drawText(ctx, "ENVIRONMENT", origin.x, origin.y + 2 * u, {
    font: theme.fontMono,
    size: 1.5 * u,
    color: theme.muted,
    weight: 600,
    baseline: "top",
    letterSpacing: 0.2 * u,
  });
}

// {location} > {cameraLabel} (bottom-left). Left = place (geo city, "UNKNOWN"
// offline); right = camera name (front/rear/lab…). The ">" separator blinks.
export function drawLocation(c: WidgetRenderContext): void {
  const { ctx, origin, u, theme } = c;
  const size = 4 * u;
  const style = {
    font: theme.fontCondensed,
    size,
    color: theme.text,
    weight: 600,
    baseline: "alphabetic" as CanvasTextBaseline,
    glow: 0.5 * u,
  };
  const left = `${c.state.location.toUpperCase()} `;
  const sep = ">";
  const right = ` ${c.state.cameraLabel.toUpperCase()}`;

  // Measure segments with the same font so they line up regardless of blink.
  ctx.save();
  ctx.font = `600 ${size}px ${theme.fontCondensed}`;
  const wLeft = ctx.measureText(left).width;
  const wSep = ctx.measureText(sep).width;
  ctx.restore();

  drawText(ctx, left, origin.x, origin.y, style);
  // Blink the separator ~1 Hz (half-second on, half off).
  if (Math.floor(performance.now() / 500) % 2 === 0) {
    drawText(ctx, sep, origin.x + wLeft, origin.y, style);
  }
  // Camera name: thin weight and no glow, so it reads much lighter than the
  // bold, glowing location.
  drawText(ctx, right, origin.x + wLeft + wSep, origin.y, { ...style, weight: 300, glow: 0 });
}
