// Visual theme for the Martian layout. Colors/fonts referenced by widgets via
// WidgetRenderContext.theme so a new layout can restyle without touching widgets.
// Palette tuned for a cinematic sci-fi feel: cool teal HUD over a graded frame,
// warm amber unit accents, holographic gradient readouts.

import type { HudTheme } from "./types";

export const martianTheme: HudTheme = {
  accent: "rgba(126, 224, 233, 0.95)", // primary teal
  accentBright: "rgba(208, 250, 255, 1)", // glow core / gradient top
  accentDeep: "rgba(38, 120, 140, 0.9)", // gradient tail / dial track
  text: "rgba(236, 247, 249, 0.98)",
  textDim: "rgba(150, 208, 218, 0.92)", // gradient bottom for big numbers
  muted: "rgba(146, 176, 184, 0.7)",
  warn: "rgba(226, 78, 60, 0.95)",
  gold: "rgba(240, 202, 128, 0.92)",
  fontMono: "ui-monospace, 'SF Mono', Menlo, monospace",
  fontCondensed:
    "'Oswald', 'Bebas Neue', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif",
  gradeCool: "rgba(24, 66, 78, 0.22)",
  gradeWarm: "rgba(78, 52, 24, 0.16)",
};
