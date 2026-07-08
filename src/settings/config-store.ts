// Persistent app settings (Tauri Store). One `config` object holds everything;
// load merges saved values over defaults so new fields are forward-compatible.

import { LazyStore } from "@tauri-apps/plugin-store";

export interface AppConfig {
  personName: string; // LOG ENTRY name
  logNo: number; // auto-incremented after each save
  outputDir: string; // "" = default (Movies/LazyVlogRecorder)
  durationMin: number; // FIXED-mode default
  audioEnabled: boolean;
  mirror: boolean;
  crtEffect: boolean; // CRT/analog grain overlay
  layoutId: string;
  cityOverride: string; // "" = auto (IP geolocation)
}

export const DEFAULT_CONFIG: AppConfig = {
  personName: "Harry",
  logNo: 1,
  outputDir: "",
  durationMin: 15,
  audioEnabled: true,
  mirror: true,
  crtEffect: true,
  layoutId: "martian",
  cityOverride: "",
};

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
