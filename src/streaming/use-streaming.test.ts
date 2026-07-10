// State-machine lock for the live controller: idle → connecting → live, the
// unstable/dropped path, terminal error/ended teardown, the not-configured
// guard, and clean stop(). Backend + recorder are mocked; only the hook's
// transitions are under test.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { StreamStatus } from "./stream-client";

// --- mocks --------------------------------------------------------------
const startStream = vi.fn((_a?: unknown) => Promise.resolve());
const writeStreamChunk = vi.fn((_a?: unknown) => Promise.resolve());
const stopStream = vi.fn(() => Promise.resolve());
vi.mock("./stream-client", () => ({
  startStream: (a: unknown) => startStream(a),
  writeStreamChunk: (a: unknown) => writeStreamChunk(a),
  stopStream: () => stopStream(),
}));

const recorderStart = vi.fn();
const recorderStop = vi.fn(() => Promise.resolve());
let capturedOnChunk: ((b: Blob) => Promise<void>) | null = null;
vi.mock("../recording/recorder", () => ({
  createRecorder: (opts: { onChunk: (b: Blob) => Promise<void> }) => {
    capturedOnChunk = opts.onChunk;
    return { start: recorderStart, stop: recorderStop, mimeType: "video/webm" };
  },
}));

// Local-save pipeline (temp WebM → transcode); default: not saving locally.
const startTempRecording = vi.fn(() => Promise.resolve("/tmp/live.webm"));
const appendTempChunk = vi.fn(() => Promise.resolve());
const transcodeToMp4 = vi.fn(() => Promise.resolve({ path: "/out/live.mp4", size: 123 }));
const remuxToMp4 = vi.fn(() => Promise.resolve({ path: "/out/live.mp4", size: 123 }));
const moveTemp = vi.fn(() => Promise.resolve({ path: "/out/live.webm", size: 123 }));
vi.mock("../recording/save-client", () => ({
  startTempRecording: (...a: unknown[]) => startTempRecording(...(a as [])),
  appendTempChunk: (...a: unknown[]) => appendTempChunk(...(a as [])),
  transcodeToMp4: (...a: unknown[]) => transcodeToMp4(...(a as [])),
  remuxToMp4: (...a: unknown[]) => remuxToMp4(...(a as [])),
  moveTemp: (...a: unknown[]) => moveTemp(...(a as [])),
}));

// Toggle whether the "webview" supports hardware H.264 for a test.
let h264Supported = false;
vi.mock("../recording/capability", () => ({
  pickStreamH264Mime: () => (h264Supported ? "video/mp4;codecs=avc1.42E01E,mp4a.40.2" : null),
}));

// Capture the stream-status listener so tests can push backend events. Other
// events (e.g. transcode-progress) get a no-op listener.
let emit: (s: StreamStatus) => void = () => {};
vi.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, cb: (e: { payload: StreamStatus }) => void) => {
    if (name === "stream-status") emit = (s) => cb({ payload: s });
    return Promise.resolve(() => {});
  },
}));

import { useStreaming, type UseStreamingRefs } from "./use-streaming";

function makeRefs(overrides: Partial<Record<string, unknown>> = {}): UseStreamingRefs {
  const ref = <T>(v: T) => ({ current: v }) as React.MutableRefObject<T>;
  return {
    canvasRef: ref<HTMLCanvasElement | null>({} as HTMLCanvasElement),
    micStreamRef: ref<MediaStream | null>(null),
    mimeTypeRef: ref<string | null>("video/webm;codecs=vp8,opus"),
    personNameRef: ref("Harry"),
    logNoRef: ref(1),
    outDirRef: ref(""),
    rtmpUrlRef: ref("rtmp://live.example/app"),
    streamKeyRef: ref("SECRET"),
    saveLocalRef: ref(false),
    streamHeightRef: ref(720),
    streamFpsRef: ref(30),
    streamBitrateKbpsRef: ref(4500),
    streamEncoderRef: ref("auto"),
    ...(overrides as object),
  } as UseStreamingRefs;
}

beforeEach(() => {
  vi.clearAllMocks();
  h264Supported = false;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useStreaming", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useStreaming(makeRefs()));
    expect(result.current.state).toBe("idle");
    expect(result.current.live).toBe(false);
  });

  it("goes idle → connecting → live and spawns the recorder", async () => {
    const { result } = renderHook(() => useStreaming(makeRefs()));
    await act(async () => {
      await result.current.start();
    });
    expect(startStream).toHaveBeenCalledOnce();
    expect(recorderStart).toHaveBeenCalledOnce();
    expect(result.current.state).toBe("connecting");

    act(() => emit({ state: "live", dropped: 0, clamped: false, message: null }));
    expect(result.current.state).toBe("live");
    expect(result.current.live).toBe(true);
  });

  it("surfaces unstable + dropped count", async () => {
    const { result } = renderHook(() => useStreaming(makeRefs()));
    await act(async () => {
      await result.current.start();
    });
    act(() => emit({ state: "unstable", dropped: 3, clamped: false, message: null }));
    expect(result.current.state).toBe("unstable");
    expect(result.current.dropped).toBe(3);
    expect(result.current.live).toBe(true);
  });

  it("carries a clamp warning through", async () => {
    const { result } = renderHook(() => useStreaming(makeRefs()));
    await act(async () => {
      await result.current.start();
    });
    act(() => emit({ state: "connecting", dropped: 0, clamped: true, message: "clamped 720p" }));
    expect(result.current.clamped).toBe(true);
  });

  it("tears down on a backend error", async () => {
    const { result } = renderHook(() => useStreaming(makeRefs()));
    await act(async () => {
      await result.current.start();
    });
    act(() => emit({ state: "error", dropped: 9, clamped: false, message: "Network too slow" }));
    await waitFor(() => expect(recorderStop).toHaveBeenCalled());
    expect(result.current.state).toBe("error");
    expect(result.current.live).toBe(false);
    expect(result.current.error).toBe("Network too slow");
  });

  it("returns to idle on a clean backend end", async () => {
    const { result } = renderHook(() => useStreaming(makeRefs()));
    await act(async () => {
      await result.current.start();
    });
    act(() => emit({ state: "ended", dropped: 0, clamped: false, message: null }));
    await waitFor(() => expect(result.current.state).toBe("idle"));
  });

  it("uses the hardware copy path when H.264 is supported (auto)", async () => {
    h264Supported = true;
    const { result } = renderHook(() => useStreaming(makeRefs()));
    await act(async () => {
      await result.current.start();
    });
    expect(startStream).toHaveBeenCalledWith(expect.objectContaining({ copy: true }));
    expect(result.current.copyActive).toBe(true);
  });

  it("forces software (VP8 re-encode) when the encoder pref is 'software'", async () => {
    h264Supported = true; // supported, but the user opted out
    const refs = makeRefs({ streamEncoderRef: { current: "software" } });
    const { result } = renderHook(() => useStreaming(refs));
    await act(async () => {
      await result.current.start();
    });
    expect(startStream).toHaveBeenCalledWith(expect.objectContaining({ copy: false }));
    expect(result.current.copyActive).toBe(false);
  });

  it("rejects start when not configured", async () => {
    const refs = makeRefs({ streamKeyRef: { current: "" } });
    const { result } = renderHook(() => useStreaming(refs));
    await act(async () => {
      await result.current.start();
    });
    expect(startStream).not.toHaveBeenCalled();
    expect(result.current.state).toBe("error");
  });

  it("stop() flushes the recorder then closes the backend", async () => {
    const { result } = renderHook(() => useStreaming(makeRefs()));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });
    expect(recorderStop).toHaveBeenCalled();
    expect(stopStream).toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });

  it("captures the local take independently of RTMP when save-local is on", async () => {
    const onSaved = vi.fn();
    const refs = makeRefs({ saveLocalRef: { current: true }, onSaved });
    const { result } = renderHook(() => useStreaming(refs));
    await act(async () => {
      await result.current.start();
    });
    // Opened a local temp WebM before the recorder began.
    expect(startTempRecording).toHaveBeenCalledWith("webm");

    // A chunk is written to BOTH the local temp and the RTMP sink.
    await act(async () => {
      await capturedOnChunk?.(new Blob([new Uint8Array([1, 2, 3])]));
    });
    expect(appendTempChunk).toHaveBeenCalled();
    expect(writeStreamChunk).toHaveBeenCalled();

    // Stop transcodes the local take and indexes it.
    await act(async () => {
      await result.current.stop();
    });
    expect(transcodeToMp4).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
    expect(result.current.savedFile).toEqual({ path: "/out/live.mp4", size: 123 });
  });

  it("keeps the local take even when the stream errors mid-broadcast", async () => {
    const onSaved = vi.fn();
    const refs = makeRefs({ saveLocalRef: { current: true }, onSaved });
    const { result } = renderHook(() => useStreaming(refs));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      emit({ state: "error", dropped: 9, clamped: false, message: "Network too slow" });
    });
    await waitFor(() => expect(transcodeToMp4).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalled();
    expect(result.current.state).toBe("error");
  });
});
