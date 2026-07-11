// Minimal layout — a pared-down look built entirely from the existing widget
// library: no mission day, gauges, or environment. It still surfaces the full
// external-API set (sensor readings, series sparklines, and the free-text
// caption) so pushed data shows up here too. Demonstrates the extensibility
// invariant: adding a layout is a single declarative file + one registry entry;
// no engine/widget changes.

import type { LayoutConfig } from "../types";
import { martianTheme } from "../theme";

export const minimalLayout: LayoutConfig = {
  id: "minimal",
  name: "Minimal",
  theme: martianTheme,
  fontScale: 0.8,
  widgets: [
    // Cinematic color grade (adds a vignette that darkens the edges) + scanline
    // so light-on-bright text stays readable, matching the other layouts.
    { type: "color-grade", anchor: "top-left", offset: { x: 0, y: 0 } },
    { type: "scanline", anchor: "top-left", offset: { x: 0, y: 0 } },

    { type: "clock", anchor: "top-right", offset: { x: -4, y: 3.7 } },

    // External-API panels (right side; sensor/series draw right-aligned).
    { type: "sensor-panel", anchor: "top-right", offset: { x: -4, y: 8.5 } },
    { type: "series-panel", anchor: "mid-right", offset: { x: -4, y: -2 } },

    // Location + the free-text caption directly below it (bottom-left).
    { type: "location", anchor: "bottom-left", offset: { x: 4, y: -5.5 } },
    { type: "caption", anchor: "bottom-left", offset: { x: 4, y: -3.5 } },

    { type: "soundwave", anchor: "bottom-right", offset: { x: -4, y: -6.5 }, widthPct: 0.28 },
    // Ship Vitals strip (battery/CPU/RAM/uptime), tucked below the soundwave.
    { type: "vitals-strip", anchor: "bottom-right", offset: { x: -4, y: -4.2 } },
    { type: "corner-frame", anchor: "top-right", offset: { x: -2, y: 2 } },
    { type: "corner-frame", anchor: "bottom-left", offset: { x: 2, y: -2 } },
  ],
};
