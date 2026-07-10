// Visual themes for the HUD. Colors/fonts are referenced by widgets via
// WidgetRenderContext.theme, so swapping the theme restyles every layout
// without touching widgets or layout specs.

import type { HudTheme } from "./types";

// The Martian (film) palette: cool teal HUD over a graded frame, warm amber
// unit accents, holographic gradient readouts, cool-white backlit LCD panel.
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
  scanline: "#bfe9ee",
  panelBg: "rgba(216, 228, 230, 0.95)", // cool-white backlit LCD (dark digits)
  panelBgDeep: "rgba(180, 197, 201, 0.95)",
  panelInk: "rgba(14, 28, 40, 0.96)",
  panelGrid: "rgba(38, 58, 68, 0.20)",
};

// Mars Amber palette: 80s CRT terminal look — monochrome orange-on-black with a
// gold highlight and a red alert, over a warm Martian-dust color grade. Lit
// amber digits on a dark LCD panel (inverted from the film's cool-white panel).
export const marsAmberTheme: HudTheme = {
  accent: "rgba(255, 104, 18, 0.97)", // primary deep-orange lines / brackets
  accentBright: "rgba(255, 178, 92, 1)", // glow core / gradient top (warm, not pale)
  accentDeep: "rgba(196, 86, 20, 0.95)", // gradient tail / dial track (lifted so the gauge arc reads on bright footage)
  text: "rgba(255, 226, 198, 0.98)", // warm off-white
  textDim: "rgba(236, 146, 58, 0.94)", // deep-amber gradient bottom for big numbers
  muted: "rgba(232, 146, 74, 0.94)", // secondary labels — lifted for legibility on bright footage
  warn: "rgba(228, 58, 30, 0.98)", // SIGNAL-LOST red
  gold: "rgba(240, 176, 58, 0.96)", // highlighted-label amber-gold
  fontMono: "ui-monospace, 'SF Mono', Menlo, monospace",
  fontCondensed:
    "'Oswald', 'Bebas Neue', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif",
  gradeCool: "rgba(72, 26, 6, 0.30)", // warm top wash (heavier)
  gradeWarm: "rgba(98, 22, 4, 0.26)", // deep red-brown bottom wash
  scanline: "#ff7a24",
  panelBg: "rgba(52, 20, 6, 0.94)", // dark amber LCD (lit amber digits)
  panelBgDeep: "rgba(32, 11, 3, 0.95)",
  panelInk: "rgba(255, 158, 66, 0.98)",
  panelGrid: "rgba(255, 140, 56, 0.13)",
};
