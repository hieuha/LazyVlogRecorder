// Frontend wrappers for the recording persistence + transcode commands.

import { invoke } from "@tauri-apps/api/core";

export interface SavedFile {
  path: string;
  size: number; // bytes
}

// NOTE: pass the Uint8Array directly — Tauri v2 transfers ArrayBuffers as raw
// bytes. Array.from() here would box millions of numbers and freeze the UI.

/** Write recorded bytes straight to the output folder; returns path + size. */
export function saveRecording(bytes: Uint8Array, filename: string): Promise<SavedFile> {
  return invoke<SavedFile>("save_recording", { bytes, filename });
}

/** Write recorded bytes to a temp file (ffmpeg input); returns the temp path. */
export function saveTempRecording(bytes: Uint8Array, ext: string): Promise<string> {
  return invoke<string>("save_temp_recording", { bytes, ext });
}

/** Transcode a temp WebM to MP4 in the output folder; returns path + size. */
export function transcodeToMp4(tempPath: string, filename: string): Promise<SavedFile> {
  return invoke<SavedFile>("transcode_to_mp4", { tempPath, filename });
}
