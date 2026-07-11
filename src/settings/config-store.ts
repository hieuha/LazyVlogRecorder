// Persistent app settings (Tauri Store). One `config` object holds everything;
// load merges saved values over defaults so new fields are forward-compatible.

import { LazyStore } from "@tauri-apps/plugin-store";

export interface AppConfig {
  personName: string; // LOG ENTRY name
  logNo: number; // auto-incremented after each save
  outputDir: string; // "" = default (Movies/LazyCamHUD)
  durationMin: number; // FIXED-mode default
  recordHeight: number; // output frame height (720 or 1080); width is 16:9
  audioEnabled: boolean;
  mirror: boolean;
  crtEffect: boolean; // CRT/analog grain overlay
  showVitals: boolean; // Ship Vitals strip (battery/CPU/RAM/uptime); off by default
  missionDayText: string; // MISSION DAY panel override; "" = auto date (Y.M.D)
  layoutId: string;
  themeId: string; // HUD palette (theme registry): "martian" | "amber"
  cityOverride: string; // "" = auto (IP geolocation)
  // External sensor HTTP API (right-side HUD panel).
  sensorApiEnabled: boolean;
  sensorApiPort: number;
  sensorApiLan: boolean; // true = bind 0.0.0.0 (LAN), false = 127.0.0.1 only
  sensorApiToken: string; // required when LAN; auto-generated
  // Go Live — RTMP(S) streaming (FB/YouTube/Twitch).
  rtmpUrl: string; // base publish URL, e.g. rtmp://a.rtmp.youtube.com/live2
  streamKey: string; // secret; composed onto rtmpUrl in the backend, never logged
  saveLocalWhileLive: boolean; // also save a local MP4 while streaming
  // Stream quality (OBS-style knobs; tune to your machine + upload speed). The
  // broadcast resolution follows recordHeight — the hardware path copies the
  // canvas (no downscale), so a separate stream height couldn't be honored there.
  streamFps: number; // broadcast frame rate (24/30/60)
  streamBitrateKbps: number; // video bitrate — match your upload speed
  // Encoder preference for BOTH streaming and local recording. "auto"/"hardware"
  // use Apple VideoToolbox (stream: webview H.264 + `-c copy`; record: hardware
  // transcode). "software" forces libx264 / VP8 re-encode. (Key kept as
  // `streamEncoder` for config back-compat; it now applies to record too.)
  streamEncoder: StreamEncoderPref;
}

export type StreamEncoderPref = "auto" | "hardware" | "software";

export const DEFAULT_CONFIG: AppConfig = {
  personName: "Harry",
  logNo: 1,
  outputDir: "",
  durationMin: 15,
  recordHeight: 1080,
  audioEnabled: true,
  mirror: true,
  crtEffect: true,
  showVitals: false,
  missionDayText: "",
  layoutId: "martian",
  themeId: "martian",
  cityOverride: "",
  sensorApiEnabled: false,
  sensorApiPort: 1337,
  sensorApiLan: true,
  sensorApiToken: "",
  rtmpUrl: "",
  streamKey: "",
  saveLocalWhileLive: true,
  streamFps: 30,
  streamBitrateKbps: 4500,
  streamEncoder: "auto",
};

/** Random hex token for the sensor API (used as a bearer token). */
export function generateToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const store = new LazyStore("config.json");

export async function loadConfig(): Promise<AppConfig> {
  try {
    const saved = (await store.get<Partial<AppConfig>>("config")) ?? {};
    return { ...DEFAULT_CONFIG, ...saved };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await store.set("config", config);
  await store.save();
}
