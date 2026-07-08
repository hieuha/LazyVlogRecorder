// Frontend wrapper for the Rust get_weather command (Open-Meteo).

import { invoke } from "@tauri-apps/api/core";

export interface Weather {
  temp_c: number | null; // null when unavailable
  humidity: number | null;
  precip_prob: number | null; // current-hour precipitation probability (%)
  weather_code: number;
}

export function getWeather(lat: number, lon: number): Promise<Weather> {
  return invoke<Weather>("get_weather", { lat, lon });
}
