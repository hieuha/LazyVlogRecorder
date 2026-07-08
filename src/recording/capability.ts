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
