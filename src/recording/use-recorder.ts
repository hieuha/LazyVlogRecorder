// Recording controller hook. Two modes:
//  - "fixed": counts down, auto-stops at durationSec (Stop still works to end early)
//  - "free":  counts up, stops only on Stop
// Chunks stream to a temp file during recording (flat memory), then transcode to
// MP4 on stop, falling back to the raw file if ffmpeg fails.

import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
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
  const [elapsedSec, setElapsedSec] = useState(0);
  const [savedFile, setSavedFile] = useState<SavedFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<Recorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
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
    setSaving(true);
    setError(null);
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
        saved = await transcodeToMp4(tempPath, outName, outDir);
      } catch (transcodeErr) {
        const rawName = makeRecordingName(person, logNo, srcExt);
        saved = await moveTemp(tempPath, rawName, outDir);
        setError(`MP4 transcode failed; saved ${srcExt.toUpperCase()}. ${transcodeErr}`);
      }
      setSavedFile(saved);
      const durationSec = Math.max(0, Math.round((performance.now() - startedAtRef.current) / 1000));
      refs.onSaved(saved, durationSec); // advance log number + index the entry
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
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
    setElapsedSec(0);
    const startedAt = performance.now();
    startedAtRef.current = startedAt;
    timerRef.current = window.setInterval(() => {
      const e = Math.floor((performance.now() - startedAt) / 1000);
      setElapsedSec(e);
      if (modeRef.current === "fixed" && e >= durRef.current) void stop();
    }, 250);
  }

  return {
    mode,
    setMode,
    durationSec,
    setDurationSec,
    recording,
    elapsedSec,
    savedFile,
    saving,
    error,
    start,
    stop,
  };
}
