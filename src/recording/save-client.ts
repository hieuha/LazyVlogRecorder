// Frontend wrapper for the Rust save_recording command.

import { invoke } from "@tauri-apps/api/core";

/** Write recorded bytes to disk; returns the saved file path. */
export function saveRecording(bytes: Uint8Array, filename: string): Promise<string> {
  return invoke<string>("save_recording", { bytes: Array.from(bytes), filename });
}
