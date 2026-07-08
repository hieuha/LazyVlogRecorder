// Recording controller hook. Two modes:
//  - "fixed": counts down, auto-stops at durationSec (Stop still works to end early)
//  - "free":  counts up, stops only on Stop
// Chunks stream to a temp file during recording (flat memory), then transcode to
// MP4 on stop, falling back to the raw file if ffmpeg fails.

import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { listen } from "@tauri-apps/api/event";
import { createRecorder, type Recorder } from "./recorder";
import {
  startTempRecording,
  appendTempChunk,
  transcodeToMp4,
  moveTemp,
  type SavedFile,
} from "./save-client";
import { extForMime, makeRecordingName } from "./output-naming";

export type RecMode = "fixed" | "free";

export interface UseRecorderRefs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  micStreamRef: MutableRefObject<MediaStream | null>;
  mimeTypeRef: MutableRefObject<string | null>;
  personNameRef: MutableRefObject<string>;
  logNoRef: MutableRefObject<number>;
  outDirRef: MutableRefObject<string>;
  /** Called after a successful save: advance the log number + index the entry. */
  onSaved: (file: SavedFile, durationSec: number) => void;
}

export function useRecorder(refs: UseRecorderRefs) {
  const [mode, setMode] = useState<RecMode>("fixed");
  const [durationSec, setDurationSec] = useState(900); // 15 min default
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [savedFile, setSavedFile] = useState<SavedFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [transcodeProgress, setTranscodeProgress] = useState(0); // 0..1
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<Recorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const pausedRef = useRef(false);
  const pauseStartRef = useRef(0);
  const pausedAccumRef = useRef(0); // total paused time (ms), excluded from elapsed
  const tempPathRef = useRef<string>("");
  const extRef = useRef<string>("webm");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const durRef = useRef(durationSec);
  durRef.current = durationSec;

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    },
    [],
  );

  // Auto-dismiss the "saved" notice after 10s.
  useEffect(() => {
    if (!savedFile) return;
    const t = window.setTimeout(() => setSavedFile(null), 10000);
    return () => clearTimeout(t);
  }, [savedFile]);

  async function stop(): Promise<void> {
    if (!recRef.current) return;
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    setPaused(false);
    pausedRef.current = false;
    setSaving(true);
    setTranscodeProgress(0);
    setError(null);

    const now = performance.now();
    const pausedTotal = pausedAccumRef.current + (pausedRef.current ? now - pauseStartRef.current : 0);
    const durationSec = Math.max(0, Math.round((now - startedAtRef.current - pausedTotal) / 1000));

    const unlisten = await listen<number>("transcode-progress", (e) => setTranscodeProgress(e.payload));
    try {
      await recRef.current.stop(); // flush all chunks to the temp file
      recRef.current = null;

      const tempPath = tempPathRef.current;
      const srcExt = extRef.current;
      const person = refs.personNameRef.current;
      const logNo = refs.logNoRef.current;
      const outDir = refs.outDirRef.current;
      let saved: SavedFile;
      try {
        const outName = makeRecordingName(person, logNo, "mp4");
        saved = await transcodeToMp4(tempPath, outName, outDir, durationSec);
      } catch (transcodeErr) {
        const rawName = makeRecordingName(person, logNo, srcExt);
        saved = await moveTemp(tempPath, rawName, outDir);
        setError(`MP4 transcode failed; saved ${srcExt.toUpperCase()}. ${transcodeErr}`);
      }
      setSavedFile(saved);
      refs.onSaved(saved, durationSec); // advance log number + index the entry
    } catch (err) {
      setError(String(err));
    } finally {
      unlisten();
      setSaving(false);
    }
  }

  function pause(): void {
    if (!recRef.current || pausedRef.current) return;
    recRef.current.pause();
    pauseStartRef.current = performance.now();
    pausedRef.current = true;
    setPaused(true);
  }

  function resume(): void {
    if (!recRef.current || !pausedRef.current) return;
    pausedAccumRef.current += performance.now() - pauseStartRef.current;
    recRef.current.resume();
    pausedRef.current = false;
    setPaused(false);
  }

  async function start(): Promise<void> {
    const canvas = refs.canvasRef.current;
    const mime = refs.mimeTypeRef.current;
    if (!canvas || !mime || recRef.current) return;
    setSavedFile(null);
    setError(null);

    const srcExt = extForMime(mime);
    extRef.current = srcExt;
    let tempPath: string;
    try {
      tempPath = await startTempRecording(srcExt);
    } catch (err) {
      setError(String(err));
      return;
    }
    tempPathRef.current = tempPath;

    recRef.current = createRecorder({
      canvas,
      micStream: refs.micStreamRef.current,
      mimeType: mime,
      onChunk: async (blob) => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        await appendTempChunk(tempPath, bytes);
      },
    });
    recRef.current.start();
    setRecording(true);
    setPaused(false);
    setElapsedSec(0);
    const startedAt = performance.now();
    startedAtRef.current = startedAt;
    pausedRef.current = false;
    pausedAccumRef.current = 0;
    timerRef.current = window.setInterval(() => {
      const t = performance.now();
      const pausedNow = pausedRef.current ? t - pauseStartRef.current : 0;
      const e = Math.floor((t - startedAt - pausedAccumRef.current - pausedNow) / 1000);
      setElapsedSec(e);
      // Auto-stop counts active (unpaused) time only.
      if (modeRef.current === "fixed" && !pausedRef.current && e >= durRef.current) void stop();
    }, 250);
  }

  return {
    mode,
    setMode,
    durationSec,
    setDurationSec,
    recording,
    paused,
    elapsedSec,
    savedFile,
    saving,
    transcodeProgress,
    error,
    start,
    stop,
    pause,
    resume,
  };
}
