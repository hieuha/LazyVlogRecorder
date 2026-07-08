// Recording controller hook. Two modes:
//  - "fixed": counts down, auto-stops at durationSec (Stop still works to end early)
//  - "free":  counts up, stops only on Stop
// Records the compositor canvas + mic, then writes the file to disk.

import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { createRecorder, type Recorder } from "./recorder";
import { saveRecording, saveTempRecording, transcodeToMp4, type SavedFile } from "./save-client";
import { extForMime, makeRecordingName } from "./output-naming";

export type RecMode = "fixed" | "free";

export interface UseRecorderRefs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  micStreamRef: MutableRefObject<MediaStream | null>;
  mimeTypeRef: MutableRefObject<string | null>;
  personNameRef: MutableRefObject<string>;
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
  // Latest values read inside the interval without re-creating it.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const durRef = useRef(durationSec);
  durRef.current = durationSec;

  // Clear the countdown interval if the component unmounts mid-recording.
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
      const blob = await recRef.current.stop();
      recRef.current = null;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const srcExt = extForMime(refs.mimeTypeRef.current ?? "video/webm");
      const person = refs.personNameRef.current;
      // Transcode recorded WebM → MP4 (H.264/AAC). Fall back to the raw source
      // file if ffmpeg fails, so a take is never lost.
      try {
        const tempPath = await saveTempRecording(bytes, srcExt);
        const outName = makeRecordingName(person, "mp4");
        setSavedFile(await transcodeToMp4(tempPath, outName));
      } catch (transcodeErr) {
        const rawName = makeRecordingName(person, srcExt);
        setSavedFile(await saveRecording(bytes, rawName));
        setError(`MP4 transcode failed; saved ${srcExt.toUpperCase()}. ${transcodeErr}`);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  function start(): void {
    const canvas = refs.canvasRef.current;
    const mime = refs.mimeTypeRef.current;
    if (!canvas || !mime || recRef.current) return;
    setSavedFile(null);
    setError(null);
    recRef.current = createRecorder({
      canvas,
      micStream: refs.micStreamRef.current,
      mimeType: mime,
    });
    recRef.current.start();
    setRecording(true);
    setElapsedSec(0);
    const startedAt = performance.now();
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
