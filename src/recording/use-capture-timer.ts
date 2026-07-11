// Shared capture timer for both local recording and live streaming. Owns the
// elapsed clock, pause accounting (paused time is excluded from elapsed), and
// FIXED-mode auto-stop. Extracted from use-recorder so the two capture paths
// can't drift — the behavior here is regression-locked by use-capture-timer.test.ts.

import { useEffect, useRef, useState } from "react";

export type RecMode = "fixed" | "free";

export interface CaptureTimer {
  /** Active (unpaused) elapsed seconds, updated ~4×/s while running. */
  elapsedSec: number;
  paused: boolean;
  /** Start ticking from zero. */
  start(): void;
  /** Stop ticking; returns the final active duration in seconds. */
  stop(): number;
  pause(): void;
  resume(): void;
}

export interface CaptureTimerOptions {
  mode: RecMode;
  durationSec: number;
  /** Called once when FIXED mode reaches durationSec (active time). */
  onAutoStop: () => void;
}

export function useCaptureTimer({ mode, durationSec, onAutoStop }: CaptureTimerOptions): CaptureTimer {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [paused, setPaused] = useState(false);

  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const pausedRef = useRef(false);
  const pauseStartRef = useRef(0);
  const pausedAccumRef = useRef(0); // total paused ms, excluded from elapsed

  // Refs mirror the latest props so the interval callback never reads stale values.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const durRef = useRef(durationSec);
  durRef.current = durationSec;
  const onAutoStopRef = useRef(onAutoStop);
  onAutoStopRef.current = onAutoStop;

  // Clear the interval if the component unmounts mid-capture.
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    },
    [],
  );

  /** Active elapsed ms right now (excludes the in-progress pause, if any). */
  function activeMs(): number {
    const now = performance.now();
    const pausedNow = pausedRef.current ? now - pauseStartRef.current : 0;
    return now - startedAtRef.current - pausedAccumRef.current - pausedNow;
  }

  function start(): void {
    if (timerRef.current !== null) clearInterval(timerRef.current);
    setElapsedSec(0);
    setPaused(false);
    startedAtRef.current = performance.now();
    pausedRef.current = false;
    pauseStartRef.current = 0;
    pausedAccumRef.current = 0;
    timerRef.current = window.setInterval(() => {
      const e = Math.floor(activeMs() / 1000);
      setElapsedSec(e);
      // Auto-stop counts active (unpaused) time only.
      if (modeRef.current === "fixed" && !pausedRef.current && e >= durRef.current) {
        onAutoStopRef.current();
      }
    }, 250);
  }

  function stop(): number {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const durationSec = Math.max(0, Math.round(activeMs() / 1000));
    setPaused(false);
    pausedRef.current = false;
    return durationSec;
  }

  function pause(): void {
    if (pausedRef.current) return;
    pauseStartRef.current = performance.now();
    pausedRef.current = true;
    setPaused(true);
  }

  function resume(): void {
    if (!pausedRef.current) return;
    pausedAccumRef.current += performance.now() - pauseStartRef.current;
    pausedRef.current = false;
    setPaused(false);
  }

  return { elapsedSec, paused, start, stop, pause, resume };
}
