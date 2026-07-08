// Free-text caption pushed via POST /text, drawn below the location line with a
// typewriter reveal and a blinking cursor. When no (recent) caption exists, the
// slot shows a decorative random hex stream so the space never looks empty.
// Everything here is burned into the recording.

import type { WidgetRenderContext } from "../types";
import { drawText } from "./text-primitives";

const MS_PER_CHAR = 40; // ~25 characters/second reveal
const CAPTION_HOLD_MS = 12_000; // after this with no update, fall back to idle hex
const HEX_GROUPS = 6;

export function drawCaption(c: WidgetRenderContext): void {
  const cap = c.state.caption;
  const now = performance.now();

  if (cap && cap.text && cap.sinceMs < CAPTION_HOLD_MS) {
    drawTypewriter(c, cap.text, cap.typing, cap.sinceMs, now);
  } else {
    drawIdleHex(c, now);
  }
}

function drawTypewriter(
  c: WidgetRenderContext,
  full: string,
  typing: boolean,
  sinceMs: number,
  now: number,
): void {
  const { ctx, origin, u, theme } = c;
  const revealed = typing ? Math.min(full.length, Math.floor(sinceMs / MS_PER_CHAR)) : full.length;
  const done = revealed >= full.length;
  const blinkOn = Math.floor(now / 400) % 2 === 0;
  const cursor = !done || blinkOn ? "▌" : " ";

  drawText(ctx, full.slice(0, revealed) + cursor, origin.x, origin.y, {
    font: theme.fontMono,
    size: 1.9 * u,
    color: theme.text,
    weight: 500,
    align: "left",
    baseline: "alphabetic",
    letterSpacing: 0.12 * u,
    glow: 0.4 * u,
  });
}

// Decorative, dim hex "data stream" for the idle state.
function drawIdleHex(c: WidgetRenderContext, now: number): void {
  const { ctx, origin, u, theme } = c;
  const bucket = Math.floor(now / 140); // refresh ~7×/sec
  let out = "";
  for (let i = 0; i < HEX_GROUPS; i++) {
    const word = hash32(bucket * 2654435761 + i * 40503) & 0xffff;
    out += (i ? " " : "") + "0x" + word.toString(16).toUpperCase().padStart(4, "0");
  }

  drawText(ctx, out, origin.x, origin.y, {
    font: theme.fontMono,
    size: 1.7 * u,
    color: theme.muted,
    weight: 500,
    align: "left",
    baseline: "alphabetic",
    letterSpacing: 0.1 * u,
  });
}

// Small integer hash → stable pseudo-random per (time bucket, index).
function hash32(x: number): number {
  x = Math.trunc(x) | 0;
  x = (x ^ 61) ^ (x >>> 16);
  x = x + (x << 3);
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return x >>> 0;
}
