// Locks the recording capability probe's codec preference so the Go-Live
// refactor (which reuses this pipeline) cannot silently change it. VP8 must win
// when both VP8 and H.264 are supported — VP9/H.264 software encoding at 1080p30
// stutters the live capture on macOS (no hardware VP8 path). See capability.ts.

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { probeRecordingCapability, pickStreamH264Mime } from "./capability";

// Install fake MediaRecorder + captureStream globals; `supported` decides which
// mimeTypes isTypeSupported() accepts.
function stubMediaStack(supported: (t: string) => boolean) {
  vi.stubGlobal("MediaRecorder", {
    isTypeSupported: (t: string) => supported(t),
  });
  // jsdom has no captureStream; define one so the probe's feature check passes.
  (HTMLCanvasElement.prototype as any).captureStream = () => ({}) as MediaStream;
}

afterAll(() => {
  delete (HTMLCanvasElement.prototype as any).captureStream;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("probeRecordingCapability", () => {
  it("prefers VP8 when both VP8 and H.264 are supported", () => {
    stubMediaStack(() => true); // everything supported
    const cap = probeRecordingCapability();
    expect(cap.supportedMimeType).toBe("video/webm;codecs=vp8,opus");
    expect(cap.ok).toBe(true);
  });

  it("falls back to VP9 when VP8 is unavailable", () => {
    stubMediaStack((t) => !t.includes("vp8"));
    const cap = probeRecordingCapability();
    expect(cap.supportedMimeType).toBe("video/webm;codecs=vp9,opus");
  });

  it("falls through to MP4/H.264 only when no WebM codec is supported", () => {
    stubMediaStack((t) => t.includes("mp4"));
    const cap = probeRecordingCapability();
    expect(cap.supportedMimeType).toBe("video/mp4;codecs=h264,aac");
  });

  it("reports not-ok when nothing is supported", () => {
    stubMediaStack(() => false);
    const cap = probeRecordingCapability();
    expect(cap.supportedMimeType).toBeNull();
    expect(cap.ok).toBe(false);
  });
});

describe("pickStreamH264Mime", () => {
  it("returns an mp4/H.264 type when the webview supports it (→ ffmpeg -c copy)", () => {
    stubMediaStack((t) => t.includes("mp4"));
    expect(pickStreamH264Mime()).toContain("mp4");
  });

  it("returns null when only WebM/VP8 is supported (→ VP8 re-encode fallback)", () => {
    stubMediaStack((t) => t.includes("webm"));
    expect(pickStreamH264Mime()).toBeNull();
  });
});
