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
  panelBorder: "rgba(255, 104, 18, 0.97)", // deep-orange border to match the accent
};

// Green Hacker palette: Matrix/phosphor terminal — green-on-black with a lime
// highlight and a red alert, over a faint green CRT grade. Lit green digits on
// a dark LCD panel.
export const greenHackerTheme: HudTheme = {
  accent: "rgba(74, 232, 122, 0.95)", // primary phosphor-green lines / brackets
  accentBright: "rgba(200, 255, 210, 1)", // glow core / gradient top (pale green)
  accentDeep: "rgba(40, 168, 88, 0.95)", // gradient tail / dial track (lifted for bright footage)
  text: "rgba(224, 255, 232, 0.98)", // pale green-white
  textDim: "rgba(120, 226, 150, 0.94)", // green gradient bottom for big numbers
  muted: "rgba(110, 190, 134, 0.8)",
  warn: "rgba(255, 86, 66, 0.98)", // red alert (contrast against the green)
  gold: "rgba(190, 255, 108, 0.96)", // highlighted-label lime
  fontMono: "ui-monospace, 'SF Mono', Menlo, monospace",
  fontCondensed:
    "'Oswald', 'Bebas Neue', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif",
  gradeCool: "rgba(18, 74, 40, 0.40)", // green top wash (stronger Matrix cast)
  gradeWarm: "rgba(12, 56, 30, 0.34)", // deep green bottom wash
  scanline: "#8effb0",
  panelBg: "rgba(10, 40, 22, 0.93)", // dark green LCD (lit green digits)
  panelBgDeep: "rgba(5, 24, 13, 0.95)",
  panelInk: "rgba(128, 255, 158, 0.98)",
  panelGrid: "rgba(128, 255, 158, 0.13)",
  panelBorder: "rgba(74, 232, 122, 0.95)", // phosphor-green border to match the accent
};

// Crypt palette: blood-red CRT terminal — crimson-on-near-black with an ember
// highlight and a hazard-amber alert, over a deep maroon color grade. Lit red
// digits on a dark red LCD panel. Matches the "Crypt" blog theme.
export const cryptTheme: HudTheme = {
  accent: "rgba(242, 54, 44, 0.98)", // primary crimson lines / brackets (punchier)
  accentBright: "rgba(255, 134, 110, 1)", // glow core / gradient top (bright red)
  accentDeep: "rgba(158, 26, 20, 0.96)", // gradient tail / dial track (blood red, lifted for bright footage)
  text: "rgba(255, 244, 240, 0.98)", // bright near-white readouts, only a whisper of warmth (was a salmon tint that read too red on dark footage)
  textDim: "rgba(240, 92, 74, 0.97)", // deep-red gradient bottom for big numbers
  muted: "rgba(236, 108, 92, 0.96)", // secondary labels — saturated so they read on bright footage
  warn: "rgba(255, 190, 60, 0.98)", // hazard amber — distinct from the ambient red
  gold: "rgba(255, 146, 74, 0.95)", // highlighted-label ember orange
  fontMono: "ui-monospace, 'SF Mono', Menlo, monospace",
  fontCondensed:
    "'Oswald', 'Bebas Neue', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif",
  gradeCool: "rgba(72, 12, 12, 0.40)", // maroon top wash (heavier)
  gradeWarm: "rgba(56, 8, 10, 0.34)", // deep blood-red bottom wash
  scanline: "#ff5a48",
  panelBg: "rgba(46, 10, 10, 0.93)", // dark red LCD (lit red digits)
  panelBgDeep: "rgba(24, 5, 6, 0.95)",
  panelInk: "rgba(255, 100, 84, 0.98)",
  panelGrid: "rgba(255, 100, 84, 0.13)",
  panelBorder: "rgba(242, 54, 44, 0.98)", // crimson border to match the accent
};
