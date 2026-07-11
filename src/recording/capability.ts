// Recording capability probe (Phase 1 smoke-test).
// The burned-in pipeline (Phase 4) needs canvas.captureStream() + MediaRecorder.
// WKWebView (macOS) and WebKitGTK (Linux) support these inconsistently, so we
// detect support up front and surface it, instead of failing at record time.

export interface RecordingCapability {
  captureStream: boolean;
  mediaRecorder: boolean;
  /** First MediaRecorder mimeType that isTypeSupported returns true for. */
  supportedMimeType: string | null;
  ok: boolean;
}

// VP8 first: on macOS there is no hardware VP8/VP9 encoder, and VP8 software
// real-time encoding is much lighter than VP9 — VP9 at 1080p30 saturates the
// main thread and stutters the capture. VP9 stays as a fallback.
const CANDIDATE_MIME_TYPES = [
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm",
  "video/mp4;codecs=h264,aac",
  "video/mp4",
];

// H.264 mimes preferred FOR STREAMING (not local recording). If the webview can
// encode H.264 directly (VideoToolbox HW on macOS), ffmpeg can `-c copy` the
// stream — no VP8 encode + no decode + no re-encode, i.e. a single hardware
// encode instead of the double software encode that stutters/freezes capture.
const STREAM_H264_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2", // H.264 baseline + AAC
  "video/mp4;codecs=h264,aac",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4;codecs=avc1",
  "video/mp4",
];

/** Best H.264 MediaRecorder mime for streaming, or null if none is supported
 *  (then streaming falls back to the VP8 re-encode path). */
export function pickStreamH264Mime(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return null;
  }
  return STREAM_H264_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export function probeRecordingCapability(): RecordingCapability {
  const captureStream =
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function";

  const mediaRecorder = typeof MediaRecorder !== "undefined";

  let supportedMimeType: string | null = null;
  if (mediaRecorder && typeof MediaRecorder.isTypeSupported === "function") {
    supportedMimeType =
      CANDIDATE_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
  }

  return {
    captureStream,
    mediaRecorder,
    supportedMimeType,
    ok: captureStream && mediaRecorder && supportedMimeType !== null,
  };
}
