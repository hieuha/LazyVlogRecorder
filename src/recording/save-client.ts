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

/** Transcode a temp WebM to MP4 (emits "transcode-progress" 0..1 events). */
export function transcodeToMp4(
  tempPath: string,
  filename: string,
  outDir: string,
  durationSec: number,
): Promise<SavedFile> {
  return invoke<SavedFile>("transcode_to_mp4", {
    tempPath,
    filename,
    outDir: outDir || null,
    durationSec,
  });
}

/** Move the temp file into the output folder (raw fallback); returns path + size. */
export function moveTemp(tempPath: string, filename: string, outDir: string): Promise<SavedFile> {
  return invoke<SavedFile>("move_temp", { tempPath, filename, outDir: outDir || null });
}
