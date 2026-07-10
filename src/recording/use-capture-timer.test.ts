// Regression lock for the capture timer BEFORE use-recorder is refactored onto
// it. Nails the exact behavior the local recorder relied on: active elapsed,
// pause excluded from elapsed, FIXED auto-stop on active time, FREE never stops.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCaptureTimer, type RecMode } from "./use-capture-timer";

// A hand-driven monotonic clock: performance.now() reads `clock`; tick() advances
// both the clock and the fake interval so the 250ms callback sees the new time.
let clock = 0;
function tick(ms: number) {
  act(() => {
    clock += ms;
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  clock = 0;
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function setup(mode: RecMode, durationSec: number, onAutoStop = () => {}) {
  return renderHook(() => useCaptureTimer({ mode, durationSec, onAutoStop }));
}

describe("useCaptureTimer", () => {
  it("counts active elapsed seconds", () => {
    const { result } = setup("free", 0);
    act(() => result.current.start());
    tick(3000);
    expect(result.current.elapsedSec).toBe(3);
  });

  it("excludes paused time from elapsed", () => {
    const { result } = setup("free", 0);
    act(() => result.current.start());
    tick(2000);
    expect(result.current.elapsedSec).toBe(2);
    act(() => result.current.pause());
    tick(5000); // paused — elapsed frozen
    expect(result.current.elapsedSec).toBe(2);
    expect(result.current.paused).toBe(true);
    act(() => result.current.resume());
    tick(1000);
    expect(result.current.elapsedSec).toBe(3);
    expect(result.current.paused).toBe(false);
  });

  it("auto-stops FIXED mode at the target on active time", () => {
    const onAutoStop = vi.fn();
    const { result } = setup("fixed", 2, onAutoStop);
    act(() => result.current.start());
    tick(1000);
    expect(onAutoStop).not.toHaveBeenCalled();
    tick(1000); // reaches 2s
    expect(onAutoStop).toHaveBeenCalled();
  });

  it("does not count paused time toward FIXED auto-stop", () => {
    const onAutoStop = vi.fn();
    const { result } = setup("fixed", 2, onAutoStop);
    act(() => result.current.start());
    tick(1000);
    act(() => result.current.pause());
    tick(10000); // long pause must not trip auto-stop
    expect(onAutoStop).not.toHaveBeenCalled();
    act(() => result.current.resume());
    tick(1000);
    expect(onAutoStop).toHaveBeenCalled();
  });

  it("never auto-stops FREE mode", () => {
    const onAutoStop = vi.fn();
    const { result } = setup("free", 2, onAutoStop);
    act(() => result.current.start());
    tick(60000);
    expect(onAutoStop).not.toHaveBeenCalled();
  });

  it("stop() returns the active duration in seconds", () => {
    const { result } = setup("free", 0);
    act(() => result.current.start());
    tick(2400);
    let dur = 0;
    act(() => {
      dur = result.current.stop();
    });
    expect(dur).toBe(2); // rounded active seconds
  });
});
