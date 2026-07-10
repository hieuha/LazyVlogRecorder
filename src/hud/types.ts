// HUD data-driven types. A layout is a declarative list of widget specs; the
// layout-engine resolves each widget's anchor to a canvas point and calls the
// matching widget draw function. Adding a new layout = new file of these specs,
// no engine changes (extensibility invariant).

export type Anchor =
  | "top-left"
  | "top-right"
  | "top-center"
  | "mid-left"
  | "mid-right"
  | "bottom-left"
  | "bottom-right"
  | "bottom-center";

/** Offsets and sizes are fractions of canvas width (keeps layouts resolution-independent). */
export interface HudTheme {
  accent: string; // primary glow (cyan/teal in Martian)
  accentBright: string; // highlight core for glow + gradient tops
  accentDeep: string; // darker teal for gradient ends / dial track
  text: string; // primary readouts
  textDim: string; // gradient bottom for large values (holographic sheen)
  muted: string; // secondary labels
  warn: string; // alert/red accent (bottom rule in the film)
  gold: string; // amber unit accents
  fontMono: string;
  fontCondensed: string;
  /** Cinematic color-grade stops applied over the webcam (cool → warm). */
  gradeCool: string;
  gradeWarm: string;
  /** Faint full-frame scanline tint. Falls back to a cool white when unset. */
  scanline?: string;
  /** MISSION DAY LCD panel: gradient top/bottom, digit ink, grid mesh. When
   *  unset, widgets fall back to the film's cool-white backlit panel. */
  panelBg?: string;
  panelBgDeep?: string;
  panelInk?: string;
  panelGrid?: string;
  /** MISSION DAY panel border. Falls back to `text` (the film's light border). */
  panelBorder?: string;
}

/** Live values the HUD renders. Phase 2 feeds mock data; Phase 3 feeds real data. */
export interface HudState {
  missionDay: number; // SOL
  personName: string; // LOG ENTRY > {name}
  logNo: number;
  clock: { h: number; m: number; s: number };
  dateText: string; // e.g. "2026.07.08"
  missionDayText?: string; // MISSION DAY panel override (blank → dateText)
  environment: string; // weather-code text
  location: string; // place (left of ">"): geo city, "UNKNOWN" when unresolved
  cameraLabel: string; // camera name (right of ">"): FRONT CAM / REAR CAM / LAB CAM…
  gauges: Record<GaugeMetric, GaugeValue>;
  /** Normalized 0..1 amplitudes for the live mic waveform; null when no audio. */
  audioBars?: number[] | null;
  /** External sensor readings pushed via the local HTTP API (right-side panel). */
  sensors?: SensorItem[];
  /** Time series pushed via POST /series, rendered as sparkline rows. */
  series?: SeriesItem[];
  /** Free-text caption pushed via POST /text, drawn with a typewriter effect. */
  caption?: CaptionState;
  /** Machine telemetry (battery/CPU/RAM/uptime) for the Ship Vitals strip. */
  vitals?: SystemVitals;
}

/** Real machine telemetry polled from the Rust `get_system_vitals` command.
 *  `battery` is null on machines without one; `stale` dims the strip. */
export interface SystemVitals {
  battery: number | null; // 0–100, null when no battery
  charging: boolean;
  cpu: number; // 0–100
  mem: number; // 0–100
  uptime: number; // seconds since boot
  stale?: boolean;
}

/** Caption line for the typewriter widget. `sinceMs` = time since it arrived. */
export interface CaptionState {
  text: string;
  typing: boolean;
  sinceMs: number;
}

/** One external sensor reading shown on the HUD; `stale` when not updated recently. */
export interface SensorItem {
  label: string;
  value: string;
  unit: string;
  stale?: boolean;
}

/** A time series (POST /series) rendered as a labelled sparkline row. */
export interface SeriesItem {
  label: string;
  value: string; // latest value, formatted for display
  unit: string;
  points: number[]; // recent numeric samples, oldest → newest
  stale?: boolean;
}

export type GaugeMetric = "humidity" | "precip" | "temp";

export interface GaugeValue {
  value: number | null; // null => render as "--" (offline first-launch)
  unit: string; // PSI / % / C
  min: number;
  max: number;
}

/**
 * Widget specs. Discriminated by `type`; the engine dispatches to a widget
 * registry keyed by that type. Each spec is pure data.
 */
export type WidgetSpec =
  | { type: "mission-day"; anchor: Anchor; offset: Vec2 }
  | { type: "log-entry"; anchor: Anchor; offset: Vec2 }
  | { type: "clock"; anchor: Anchor; offset: Vec2 }
  | { type: "gauge-arc"; anchor: Anchor; offset: Vec2; metric: GaugeMetric; label: string; scale?: number }
  | { type: "environment"; anchor: Anchor; offset: Vec2 }
  | { type: "location"; anchor: Anchor; offset: Vec2 }
  | { type: "corner-frame"; anchor: Anchor; offset: Vec2 }
  | { type: "scanline"; anchor: Anchor; offset: Vec2 }
  | { type: "color-grade"; anchor: Anchor; offset: Vec2 }
  | { type: "soundwave"; anchor: Anchor; offset: Vec2; widthPct: number }
  | { type: "sensor-panel"; anchor: Anchor; offset: Vec2 }
  | { type: "series-panel"; anchor: Anchor; offset: Vec2 }
  | { type: "caption"; anchor: Anchor; offset: Vec2 }
  | { type: "vitals-strip"; anchor: Anchor; offset: Vec2 };

export interface Vec2 {
  x: number;
  y: number;
}

export interface LayoutConfig {
  id: string;
  name: string;
  theme: HudTheme;
  /** Uniform text-size multiplier applied to widget `u` (positions unaffected). */
  fontScale?: number;
  widgets: WidgetSpec[];
}

/** Resolved drawing context handed to each widget draw function. */
export interface WidgetRenderContext {
  ctx: CanvasRenderingContext2D;
  /** Anchor-resolved origin in device pixels. */
  origin: Vec2;
  /** Canvas size in device pixels. */
  width: number;
  height: number;
  /** Shared scale unit = width / 100, so 1 unit ≈ 1% of width. */
  u: number;
  theme: HudTheme;
  state: HudState;
}
