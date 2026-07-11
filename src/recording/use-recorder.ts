// Recording controller hook. Two modes:
//  - "fixed": counts down, auto-stops at durationSec (Stop still works to end early)
//  - "free":  counts up, stops only on Stop
// Chunks stream to a temp file during recording (flat memory), then transcode to
// MP4 on stop, falling back to the raw file if ffmpeg fails.
//
// The elapsed clock / pause accounting / FIXED auto-stop live in useCaptureTimer,
// shared with the live-streaming path so the two can't drift.

import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { listen } from "@tauri-apps/api/event";
import { createRecorder, type Recorder } from "./recorder";
import { useCaptureTimer, type RecMode } from "./use-capture-timer";
import {
  startTempRecording,
  appendTempChunk,
  transcodeToMp4,
  moveTemp,
  type SavedFile,
} from "./save-client";
import { extForMime, makeRecordingName } from "./output-naming";
import type { StreamEncoderPref } from "../settings/config-store";

export type { RecMode };

export interface UseRecorderRefs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  micStreamRef: MutableRefObject<MediaStream | null>;
  mimeTypeRef: MutableRefObject<string | null>;
  personNameRef: MutableRefObject<string>;
  logNoRef: MutableRefObject<number>;
  outDirRef: MutableRefObject<string>;
  /** Encoder preference (shared with streaming): "software" forces libx264,
   *  otherwise the MP4 transcode uses hardware VideoToolbox. */
  encoderPrefRef: MutableRefObject<StreamEncoderPref>;
  /** Called after a successful save: advance the log number + index the entry. */
  onSaved: (file: SavedFile, durationSec: number) => void;
}

export function useRecorder(refs: UseRecorderRefs) {
  const [mode, setMode] = useState<RecMode>("fixed");
  const [durationSec, setDurationSec] = useState(900); // 15 min default
  const [recording, setRecording] = useState(false);
  const [savedFile, setSavedFile] = useState<SavedFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [transcodeProgress, setTranscodeProgress] = useState(0); // 0..1
  const [error, setError] = useState<string | null>(null);

  const timer = useCaptureTimer({ mode, durationSec, onAutoStop: () => void stop() });

  const recRef = useRef<Recorder | null>(null);
  const tempPathRef = useRef<string>("");
  const extRef = useRef<string>("webm");

  // Auto-dismiss the "saved" notice after 10s.
  useEffect(() => {
    if (!savedFile) return;
    const t = window.setTimeout(() => setSavedFile(null), 10000);
    return () => clearTimeout(t);
  }, [savedFile]);

  async function stop(): Promise<void> {
    if (!recRef.current) return;
    const durationSec = timer.stop();
    setRecording(false);
    setSaving(true);
    setTranscodeProgress(0);
    setError(null);

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
        const hardware = refs.encoderPrefRef.current !== "software";
        saved = await transcodeToMp4(tempPath, outName, outDir, durationSec, hardware);
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
    if (!recRef.current || timer.paused) return;
    recRef.current.pause();
    timer.pause();
  }

  function resume(): void {
    if (!recRef.current || !timer.paused) return;
    recRef.current.resume();
    timer.resume();
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
    timer.start();
  }

  return {
    mode,
    setMode,
    durationSec,
    setDurationSec,
    recording,
    paused: timer.paused,
    elapsedSec: timer.elapsedSec,
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
