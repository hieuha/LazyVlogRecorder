// Frontend wrappers for the recording persistence + transcode commands.
// Recording is streamed to a temp file chunk-by-chunk to keep memory flat.

import { invoke } from "@tauri-apps/api/core";

export interface SavedFile {
  path: string;
  size: number; // bytes
}

/** Create an empty temp file for a recording; returns its path. */
export function startTempRecording(ext: string): Promise<string> {
  return invoke<string>("start_temp_recording", { ext });
}

/** Append a recorded chunk to the temp file. Bytes go over as raw ArrayBuffer. */
export function appendTempChunk(path: string, bytes: Uint8Array): Promise<void> {
  return invoke("append_temp_chunk", { path, bytes });
}

/** Transcode a temp WebM to MP4 (emits "transcode-progress" 0..1 events).
 *  `hardware` uses VideoToolbox (Apple Media Engine) with a libx264 fallback. */
export function transcodeToMp4(
  tempPath: string,
  filename: string,
  outDir: string,
  durationSec: number,
  hardware: boolean,
): Promise<SavedFile> {
  return invoke<SavedFile>("transcode_to_mp4", {
    tempPath,
    filename,
    outDir: outDir || null,
    durationSec,
    hardware,
  });
}

/** Remux an already-H.264 temp file to a faststart MP4 (no re-encode). Used for
 *  the streaming copy path where the recorder already produced H.264. */
export function remuxToMp4(tempPath: string, filename: string, outDir: string): Promise<SavedFile> {
  return invoke<SavedFile>("remux_to_mp4", { tempPath, filename, outDir: outDir || null });
}

/** Move the temp file into the output folder (raw fallback); returns path + size. */
export function moveTemp(tempPath: string, filename: string, outDir: string): Promise<SavedFile> {
  return invoke<SavedFile>("move_temp", { tempPath, filename, outDir: outDir || null });
}
