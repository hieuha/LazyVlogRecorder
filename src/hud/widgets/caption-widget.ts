// Free-text caption pushed via POST /text, drawn as a centered subtitle with a
// typewriter reveal and a blinking cursor. Burned into the recording.

import type { WidgetRenderContext } from "../types";
import { drawText } from "./text-primitives";

const MS_PER_CHAR = 40; // ~25 characters/second reveal

export function drawCaption(c: WidgetRenderContext): void {
  const { ctx, origin, u, theme, state } = c;
  const cap = state.caption;
  if (!cap || !cap.text) return;

  const full = cap.text;
  const revealed = cap.typing
    ? Math.min(full.length, Math.floor(cap.sinceMs / MS_PER_CHAR))
    : full.length;
  const done = revealed >= full.length;

  // Blinking cursor while typing, then a slow blink once finished.
  const blinkOn = Math.floor(performance.now() / 400) % 2 === 0;
  const cursor = !done || blinkOn ? "▌" : " ";
  const shown = full.slice(0, revealed) + cursor;

  drawText(ctx, shown, origin.x, origin.y, {
    font: theme.fontMono,
    size: 2.1 * u,
    color: theme.text,
    weight: 600,
    align: "center",
    baseline: "alphabetic",
    letterSpacing: 0.12 * u,
    glow: 0.5 * u,
  });
}
