// Recon layout — a deliberately different silhouette from Martian. Instead of a
// vertical data column on the left, the three gauges form a compact horizontal
// TELEMETRY STRIP across the bottom-left, with the clock/log/sensors/series
// stacked as a right-side rail. The bottom-left stacks location → caption →
// gauge strip. The result reads as a wide instrument panel rather than
// Martian's left-column HUD. Built entirely from the existing widget library:
// adding a layout is one declarative file + one registry entry.
//
// Placement notes:
// - gauge-arc draws label/value left-aligned with the dial to the right, so the
//   three gauges tile left→right along the bottom with ~21u pitch.
// - sensor-panel and series-panel draw right-aligned to origin.x, so they must
//   stay on the right (top-right / mid-right).
// - caption and location draw left-aligned.

import type { LayoutConfig } from "../types";
import { martianTheme } from "../theme";

export const reconLayout: LayoutConfig = {
  id: "recon",
  name: "Recon",
  theme: martianTheme, // fallback; the active palette comes from the theme registry
  fontScale: 0.8,
  widgets: [
    // Cinematic color grade over the webcam, then scanline wash, then HUD.
    { type: "color-grade", anchor: "top-left", offset: { x: 0, y: 0 } },
    { type: "scanline", anchor: "top-left", offset: { x: 0, y: 0 } },

    // Corner brackets on all four corners. The bottom-left bracket stays; the
    // telemetry stack is lifted clear of it (see offsets below) so nothing sits
    // inside the corner arms.
    { type: "corner-frame", anchor: "top-left", offset: { x: 2, y: 2 } },
    { type: "corner-frame", anchor: "top-right", offset: { x: -2, y: 2 } },
    { type: "corner-frame", anchor: "bottom-left", offset: { x: 2, y: -2 } },
    { type: "corner-frame", anchor: "bottom-right", offset: { x: -2, y: -2 } },

    // Top-left header: mission day (SOL + date panel).
    { type: "mission-day", anchor: "top-left", offset: { x: 4, y: 4.5 } },

    // Right rail: clock + log entry header, then the external-API panels
    // (sensor readings under the log, series sparklines mid-right).
    { type: "clock", anchor: "top-right", offset: { x: -4, y: 5 } },
    { type: "log-entry", anchor: "top-right", offset: { x: -4, y: 7.4 } },
    { type: "sensor-panel", anchor: "top-right", offset: { x: -4, y: 12 } },
    { type: "series-panel", anchor: "mid-right", offset: { x: -4, y: -4 } },

    // Bottom-left stack (top → bottom): horizontal telemetry strip of three
    // gauges, then the location title, then the free-text caption directly under
    // it. The whole group is lifted so the caption clears the corner bracket.
    { type: "gauge-arc", anchor: "bottom-left", offset: { x: 4, y: -14.9 }, metric: "humidity", label: "Humidity", scale: 0.7 },
    { type: "gauge-arc", anchor: "bottom-left", offset: { x: 16.5, y: -14.9 }, metric: "precip", label: "Rain", scale: 0.7 },
    { type: "gauge-arc", anchor: "bottom-left", offset: { x: 29, y: -14.9 }, metric: "temp", label: "Temp", scale: 0.7 },
    { type: "location", anchor: "bottom-left", offset: { x: 4, y: -5.9 } },
    { type: "caption", anchor: "bottom-left", offset: { x: 4, y: -3.2 } },

    // Live mic soundwave + vitals strip form the bottom-right block. Vitals uses
    // a middle baseline vs caption's alphabetic one, so it sits ~0.8u higher than
    // the caption's offset to line up on the same visual row.
    { type: "soundwave", anchor: "bottom-right", offset: { x: -4, y: -6.2 }, widthPct: 0.24 },

    // Ship Vitals strip (battery/CPU/RAM/uptime), level with the caption row.
    { type: "vitals-strip", anchor: "bottom-right", offset: { x: -4, y: -4 } },
  ],
};
