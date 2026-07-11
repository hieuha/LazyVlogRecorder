import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRecorder, type RecorderOptions } from "./recorder";

// --- Minimal DOM media mocks (jsdom has no MediaRecorder / captureStream) ------
let lastRecorder: FakeRecorder;

class FakeRecorder {
  state = "inactive";
  ondataavailable: ((e: { data: { size: number } }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: unknown, public opts: unknown) {
    lastRecorder = this;
  }
  start() {
    this.state = "recording";
  }
  pause() {
    this.state = "paused";
  }
  resume() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

class FakeStream {
  constructor(public tracks: unknown[] = []) {}
  getAudioTracks() {
    return [];
  }
}

const fakeCanvas = {
  captureStream: () => ({ getVideoTracks: () => [{ kind: "video" }] }),
} as unknown as HTMLCanvasElement;

const flush = () => new Promise((r) => setTimeout(r, 0));
const emit = (size: number) => lastRecorder.ondataavailable?.({ data: { size } });

function make(opts: Partial<RecorderOptions>) {
  return createRecorder({
    canvas: fakeCanvas,
    micStream: null,
    mimeType: "video/webm",
    onChunk: async () => {},
    ...opts,
  });
}

beforeEach(() => {
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("MediaStream", FakeStream);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createRecorder chunk handling", () => {
  it("has no write error before anything goes wrong", () => {
    const rec = make({});
    expect(rec.getWriteError()).toBeNull();
  });

  it("passes each non-empty chunk to onChunk and skips zero-size chunks", async () => {
    const onChunk = vi.fn(async () => {});
    const rec = make({ onChunk });
    rec.start();
    emit(10);
    emit(0); // dropped by the recorder
    emit(20);
    await flush();
    expect(onChunk).toHaveBeenCalledTimes(2);
  });

  it("captures the FIRST chunk-write failure instead of swallowing it (R3)", async () => {
    const onChunk = vi.fn(async () => {
      throw new Error("disk full");
    });
    const rec = make({ onChunk });
    rec.start();
    emit(10);
    await flush();
    expect(rec.getWriteError()).toBeInstanceOf(Error);
    expect(String(rec.getWriteError())).toContain("disk full");
    // The chain survives the failure — a later chunk still reaches onChunk.
    emit(20);
    await flush();
    expect(onChunk).toHaveBeenCalledTimes(2);
  });

  it("bounds the queue and fires onOverflow once when the sink stalls (R2)", async () => {
    const onChunk = vi.fn(() => new Promise<void>(() => {})); // never resolves → queue grows
    const onOverflow = vi.fn();
    const rec = make({ onChunk, onOverflow, maxPendingChunks: 2 });
    rec.start();
    emit(1); // queued 0 -> 1 (this one starts running, never resolves)
    emit(2); // queued 1 -> 2 (waits behind #1 in the ordered chain)
    emit(3); // queued 2 >= cap -> overflow, dropped
    emit(4); // already overflowed -> ignored
    await flush();
    expect(onOverflow).toHaveBeenCalledTimes(1);
    expect(rec.getWriteError()).toBeInstanceOf(Error);
    // Writes are strictly ordered, so with #1 stalled only #1 is in flight; #2 is
    // queued behind it and #3/#4 are dropped by the cap.
    expect(onChunk).toHaveBeenCalledTimes(1);
  });

  it("does not cap the queue when maxPendingChunks is unset (streaming path)", async () => {
    const onChunk = vi.fn(() => new Promise<void>(() => {}));
    const onOverflow = vi.fn();
    const rec = make({ onChunk, onOverflow }); // no maxPendingChunks
    rec.start();
    for (let i = 0; i < 50; i++) emit(1);
    await flush();
    expect(onOverflow).not.toHaveBeenCalled();
    expect(rec.getWriteError()).toBeNull();
  });

  it("stop() resolves after the pending writes settle", async () => {
    const rec = make({ onChunk: async () => {} });
    rec.start();
    emit(10);
    await expect(rec.stop()).resolves.toBeUndefined();
  });
});
