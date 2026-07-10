// Persistent app settings (Tauri Store). One `config` object holds everything;
// load merges saved values over defaults so new fields are forward-compatible.

import { LazyStore } from "@tauri-apps/plugin-store";

export interface AppConfig {
  personName: string; // LOG ENTRY name
  logNo: number; // auto-incremented after each save
  outputDir: string; // "" = default (Movies/LazyVlogRecorder)
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
}

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
