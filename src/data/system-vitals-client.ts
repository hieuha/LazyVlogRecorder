// Machine-telemetry source for the Ship Vitals strip. Polls the Rust
// `get_system_vitals` command on an interval (NOT per frame — CPU% needs a
// sampling window) and caches the last-good value. Enable/disable is live so
// the Settings toggle can start/stop polling without a relaunch.

import { invoke } from "@tauri-apps/api/core";
import type { SystemVitals } from "../hud/types";

const POLL_MS = 2000; // sampling window for CPU deltas on the Rust side
const STALE_MS = 6000; // mark stale (dim the strip) if no fresh reading within this

export interface SystemVitalsSource {
  /** Latest cached vitals, or undefined when disabled / not yet read. */
  getVitals(): SystemVitals | undefined;
  /** Start/stop polling live (Settings toggle). */
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

export function createSystemVitalsSource(enabled: boolean): SystemVitalsSource {
  let timer: ReturnType<typeof setInterval> | null = null;
  let latest: SystemVitals | undefined;
  let lastOk = 0;

  async function poll(): Promise<void> {
    try {
      const v = await invoke<SystemVitals>("get_system_vitals");
      latest = v;
      lastOk = Date.now();
    } catch {
      // Keep last-good; staleness is derived in getVitals().
    }
  }

  function start(): void {
    if (timer) return;
    void poll(); // prime immediately so the strip appears without a 2s delay
    timer = setInterval(() => void poll(), POLL_MS);
  }

  function stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
    latest = undefined; // widget draws nothing when disabled
    lastOk = 0;
  }

  if (enabled) start();

  return {
    getVitals() {
      if (!latest) return undefined;
      return { ...latest, stale: Date.now() - lastOk > STALE_MS };
    },
    setEnabled(next: boolean) {
      if (next) start();
      else stop();
    },
    dispose() {
      stop();
    },
  };
}
