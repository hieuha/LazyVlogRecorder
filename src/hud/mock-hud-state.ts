// Mock HUD state for Phase 2 — gently animated gauge values + real clock so the
// layout can be developed before the data layer exists. Phase 3 replaces this
// with a real data source (Open-Meteo weather/AQI + IP geolocation).

import type { HudState } from "./types";

export function createMockHudState(): () => HudState {
  const start = performance.now();

  return (): HudState => {
    const t = (performance.now() - start) / 1000;
    const now = new Date();
    const wobble = (base: number, amp: number, speed: number) =>
      base + Math.sin(t * speed) * amp;

    return {
      missionDay: 26,
      personName: "Harry", // default = OS user; editable in Settings (Phase 6)
      logNo: 1,
      clock: { h: now.getHours(), m: now.getMinutes() },
      dateText: `${now.getFullYear()}.${p2(now.getMonth() + 1)}.${p2(now.getDate())}`,
      environment: "Clear",
      location: "SAIGON", // Phase 3: geo city
      cameraLabel: "FRONT CAM", // Phase 6: per-camera name from selected device
      gauges: {
        pressure: { value: wobble(12.49, 0.15, 0.6), unit: "PSI", min: 0, max: 15 },
        oxygen: { value: wobble(20.9, 0.4, 0.4), unit: "%", min: 0, max: 100 },
        temp: { value: wobble(28.4, 0.6, 0.3), unit: "C", min: -20, max: 50 },
      },
    };
  };
}

function p2(n: number): string {
  return n.toString().padStart(2, "0");
}
