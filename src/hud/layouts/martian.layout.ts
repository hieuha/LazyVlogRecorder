// Martian layout — declarative widget placement matching the film HUD.
// Offsets/positions are in `u` units (1u = 1% of canvas width). To add a new
// look, copy this file, tweak specs/theme, and register it — no engine changes.

import type { LayoutConfig } from "../types";
import { martianTheme } from "../theme";

export const martianLayout: LayoutConfig = {
  id: "martian",
  name: "The Martian",
  theme: martianTheme,
  fontScale: 0.8,
  widgets: [
    // Cinematic color grade over the webcam, then scanline wash, then HUD.
    { type: "color-grade", anchor: "top-left", offset: { x: 0, y: 0 } },
    { type: "scanline", anchor: "top-left", offset: { x: 0, y: 0 } },

    // Corner brackets
    { type: "corner-frame", anchor: "top-left", offset: { x: 2, y: 2 } },
    { type: "corner-frame", anchor: "top-right", offset: { x: -2, y: 2 } },
    { type: "corner-frame", anchor: "bottom-left", offset: { x: 2, y: -2 } },
    { type: "corner-frame", anchor: "bottom-right", offset: { x: -2, y: -2 } },

    // Left column, top-anchored so vertical spacing is fixed regardless of
    // window aspect (SOL → gauges → ENVIRONMENT), mirroring the film order.
    { type: "mission-day", anchor: "top-left", offset: { x: 4, y: 4.5 } },
    { type: "gauge-arc", anchor: "top-left", offset: { x: 4, y: 14 }, metric: "humidity", label: "Humidity" },
    { type: "gauge-arc", anchor: "top-left", offset: { x: 4, y: 24 }, metric: "precip", label: "Rain" },
    { type: "gauge-arc", anchor: "top-left", offset: { x: 4, y: 34 }, metric: "temp", label: "Temp" },
    { type: "environment", anchor: "top-left", offset: { x: 4, y: 43.5 } },

    // Bottom-left location, lifted just enough to sit above the caption.
    { type: "location", anchor: "bottom-left", offset: { x: 4, y: -5.5 } },

    // Free-text caption (POST /text), left-aligned snugly below the location line
    // (raised off the bottom bracket arm).
    { type: "caption", anchor: "bottom-left", offset: { x: 4, y: -3.5 } },

    // Top-right clock (TIME + DATE) + log entry
    { type: "clock", anchor: "top-right", offset: { x: -4, y: 5 } },
    { type: "log-entry", anchor: "top-right", offset: { x: -4, y: 7.4 } },

    // External sensor readings (POST /sensors), right side under the log entry.
    { type: "sensor-panel", anchor: "top-right", offset: { x: -4, y: 12 } },
    // Sensor time-series sparklines (POST /series), mid-right.
    { type: "series-panel", anchor: "mid-right", offset: { x: -4, y: -2 } },

    // Live mic soundwave, bottom-right, level with HAB on the left
    { type: "soundwave", anchor: "bottom-right", offset: { x: -4, y: -5.5 }, widthPct: 0.28 },
  ],
};
