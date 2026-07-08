// Real HUD data source (Phase 3). Resolves location via IP geolocation, then
// weather + air quality, and refreshes every 10 minutes. Values persist between
// refreshes (last-good); when nothing has resolved yet (offline first-launch)
// location shows "UNKNOWN" and gauges render "--" (null).
//
// personName / logNo / cameraLabel / audioBars are placeholders here; App and
// (later) Settings inject the real values into each frame's state.

import type { GaugeValue, HudState } from "../hud/types";
import { geoLocate, geocodeCity } from "./geolocation-client";
import { getWeather } from "./weather-client";
import { weatherCodeToText } from "./metric-mapping";

const REFRESH_MS = 10 * 60 * 1000;

export interface HudDataSource {
  getState(): HudState;
  setCityOverride(city: string): void;
  dispose(): void;
}

export function createHudDataSource(cityOverride?: string): HudDataSource {
  const gauges: Record<"humidity" | "precip" | "temp", GaugeValue> = {
    humidity: { value: null, unit: "%", min: 0, max: 100 },
    precip: { value: null, unit: "%", min: 0, max: 100 },
    temp: { value: null, unit: "C", min: -20, max: 50 },
  };
  let override = cityOverride?.trim() || "";
  let location = override.toUpperCase() || "UNKNOWN";
  let environment = "";
  let coords: { lat: number; lon: number } | null = null;

  async function refreshConditions(): Promise<void> {
    if (!coords) return;
    try {
      const w = await getWeather(coords.lat, coords.lon);
      gauges.humidity.value = w.humidity;
      gauges.precip.value = w.precip_prob;
      gauges.temp.value = w.temp_c;
      environment = weatherCodeToText(w.weather_code);
    } catch {
      /* keep last-good */
    }
  }

  // Resolve coordinates + location: geocode the override when set, else IP geo.
  // Weather/AQI then follow the resolved coordinates.
  async function resolveLocation(): Promise<void> {
    if (override) {
      try {
        const g = await geocodeCity(override);
        coords = { lat: g.lat, lon: g.lon };
        location = (g.city || override).toUpperCase();
        await refreshConditions();
        return;
      } catch {
        location = override.toUpperCase(); // keep label; conditions stay last-good
        return;
      }
    }
    try {
      const g = await geoLocate();
      coords = { lat: g.lat, lon: g.lon };
      location = (g.city || "UNKNOWN").toUpperCase();
      await refreshConditions();
    } catch {
      location = "UNKNOWN";
    }
  }

  void resolveLocation();
  const timer = setInterval(() => void refreshConditions(), REFRESH_MS);

  return {
    getState(): HudState {
      const now = new Date();
      return {
        missionDay: 26, // Settings (Phase 6) will source this
        personName: "Harry",
        logNo: 1,
        clock: { h: now.getHours(), m: now.getMinutes(), s: now.getSeconds() },
        dateText: `${now.getFullYear()}.${p2(now.getMonth() + 1)}.${p2(now.getDate())}`,
        environment,
        location,
        cameraLabel: "CAM", // App overrides with the selected camera name
        gauges,
        audioBars: null, // App overrides with live mic data
      };
    },
    setCityOverride(city: string): void {
      override = city.trim();
      void resolveLocation(); // re-geocode + refetch weather for the new place
    },
    dispose(): void {
      clearInterval(timer);
    },
  };
}

function p2(n: number): string {
  return n.toString().padStart(2, "0");
}
