// Single source of truth for the runtime platform, so feature gating (e.g. Go
// Live is desktop-only) lives in one place instead of scattered checks. The OS
// plugin resolves the platform synchronously at startup.

import { platform } from "@tauri-apps/plugin-os";

// `platform()` reads a value the Tauri runtime injects; outside it (e.g. vitest
// / jsdom) it throws, so fall back to a desktop default there.
function detectPlatform(): string {
  try {
    return platform();
  } catch {
    return "macos";
  }
}

export const OS_PLATFORM = detectPlatform();

/** iOS/iPadOS — no subprocesses (ffmpeg), so Go Live/streaming is unavailable. */
export const isIOS = OS_PLATFORM === "ios";

/** macOS desktop. */
export const isMacOS = OS_PLATFORM === "macos";
