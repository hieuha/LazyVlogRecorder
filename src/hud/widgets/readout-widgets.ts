// Text readout widgets for the Martian layout. Grouped in one file since they
// share the same concern (styled text blocks); the engine dispatches per type.

import type { WidgetRenderContext } from "../types";
import { drawText, pad2 } from "./text-primitives";

// MISSION DAY label + boxed "SOL {n}" (top-left of the film HUD).
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
  const label = state.dateText; // date in the box (replaces SOL)
  const size = 3.4 * u;
  ctx.save();
  ctx.font = `600 ${size}px ${theme.fontCondensed}`;
  const w = ctx.measureText(label).width + 2.4 * u;
  const h = size + 1.4 * u;
  ctx.strokeStyle = theme.text;
  ctx.lineWidth = 0.22 * u;
  ctx.strokeRect(origin.x, boxY, w, h);
  ctx.restore();
  drawText(ctx, label, origin.x + 1.2 * u, boxY + h / 2, {
    font: theme.fontCondensed,
    size,
    color: theme.text,
    weight: 600,
    baseline: "middle",
    glow: 0.4 * u,
  });
}

// TIME hh mm (top-right, right-aligned). DATE lives in the MISSION DAY block.
export function drawClock(c: WidgetRenderContext): void {
  const { ctx, origin, u, theme, state } = c;
  drawText(ctx, `TIME  ${pad2(state.clock.h)} ${pad2(state.clock.m)}`, origin.x, origin.y, {
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
// offline); right = camera name (front/rear/lab…).
export function drawLocation(c: WidgetRenderContext): void {
  const { ctx, origin, u, theme, state } = c;
  const text = `${state.location.toUpperCase()} > ${state.cameraLabel.toUpperCase()}`;
  drawText(ctx, text, origin.x, origin.y, {
    font: theme.fontCondensed,
    size: 4 * u,
    color: theme.text,
    weight: 600,
    baseline: "alphabetic",
    glow: 0.5 * u,
  });
}
