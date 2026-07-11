// Frontend wrappers for the live-streaming backend commands (streaming.rs).
// The stream key is passed straight through to Rust and composed into the RTMP
// URL there; it is never logged or put into any event payload.

import { invoke } from "@tauri-apps/api/core";

export interface StartStreamArgs {
  url: string;
  key: string;
  height: number;
  fps: number;
  bitrateKbps: number;
  /** true when the webview produced H.264 → ffmpeg remuxes (`-c copy`), no
   *  re-encode. Resolution/bitrate then come from the recorder, not ffmpeg. */
  copy: boolean;
}

/** Spawn the long-lived RTMP(S) ffmpeg (RTMP only — the local MP4, if enabled,
 *  is captured separately by the recorder so the network can't degrade it). */
export function startStream(a: StartStreamArgs): Promise<void> {
  return invoke("start_stream", {
    url: a.url,
    key: a.key,
    height: a.height,
    fps: a.fps,
    bitrateKbps: a.bitrateKbps,
    copy: a.copy,
  });
}

/** Feed one MediaRecorder chunk to the live ffmpeg (bytes as raw ArrayBuffer). */
export function writeStreamChunk(bytes: Uint8Array): Promise<void> {
  return invoke("write_stream_chunk", { bytes });
}

/** Flush + close the live stream (no-op if nothing is running). */
export function stopStream(): Promise<void> {
  return invoke("stop_stream");
}

/** Live status pushed from the backend on the "stream-status" event. */
export interface StreamStatus {
  state: "connecting" | "live" | "unstable" | "ended" | "error";
  dropped: number;
  clamped: boolean;
  message: string | null;
}
