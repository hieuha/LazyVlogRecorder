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
  closeTempRecording,
  transcodeToMp4,
  remuxToMp4,
  moveTemp,
  type SavedFile,
} from "./save-client";
import { extForMime, makeRecordingName } from "./output-naming";
import { pickStreamH264Mime } from "./capability";
import type { StreamEncoderPref } from "../settings/config-store";

// Cap the hardware H.264 recorder's bitrate so chunks stay small. Uncapped, the
// webview picks a very high rate; 12 Mbps is visually lossless at 1080p and keeps
// the temp writes cheap. VP8 keeps its default (unset).
const RECORD_H264_BPS = 12_000_000;

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
  const copyRef = useRef<boolean>(false); // recorded H.264 directly → remux on save, not transcode

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
      const rec = recRef.current;
      await rec.stop(); // flush all chunks to the temp file
      const writeErr = rec.getWriteError(); // disk-full / overflow → warn, don't claim success
      recRef.current = null;

      const tempPath = tempPathRef.current;
      await closeTempRecording(tempPath).catch(() => {}); // close the append handle before transcode/move
      const srcExt = extRef.current;
      const person = refs.personNameRef.current;
      const logNo = refs.logNoRef.current;
      const outDir = refs.outDirRef.current;
      let saved: SavedFile;
      const copy = copyRef.current;
      try {
        const outName = makeRecordingName(person, logNo, "mp4");
        // Copy path: recorded H.264 already → remux (fast, no VP8 decode/re-encode).
        // Else transcode the VP8 temp (hardware unless the encoder is forced software).
        saved = copy
          ? await remuxToMp4(tempPath, outName, outDir)
          : await transcodeToMp4(tempPath, outName, outDir, durationSec, refs.encoderPrefRef.current !== "software");
      } catch (finalizeErr) {
        const rawName = makeRecordingName(person, logNo, srcExt);
        saved = await moveTemp(tempPath, rawName, outDir);
        setError(`MP4 finalize failed; saved ${srcExt.toUpperCase()}. ${finalizeErr}`);
      }
      setSavedFile(saved);
      // A write failure/overflow means the take may be truncated — warn rather
      // than report a clean save (this is the root cause, so it wins over any
      // transcode-fallback message set above).
      if (writeErr != null) {
        setError(`Some recording data failed to write; the saved take may be incomplete. ${writeErr}`);
      }
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
    if (!canvas || recRef.current) return;

    // Prefer a hardware H.264 recorder (VideoToolbox) → the browser encodes on the
    // Media Engine, freeing the CPU (smoother capture) AND making save a fast remux
    // instead of a slow VP8 decode + re-encode. Falls back to VP8 when H.264 isn't
    // available or the encoder is forced to software.
    const h264 = refs.encoderPrefRef.current === "software" ? null : pickStreamH264Mime();
    const copy = h264 !== null;
    const mime = h264 ?? refs.mimeTypeRef.current;
    if (!mime) return;
    copyRef.current = copy;
    setSavedFile(null);
    setError(null);

    const srcExt = copy ? "mp4" : extForMime(mime);
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
      // Smaller, more frequent chunks: each temp-file write is ~1/4 the size, so
      // its main-thread cost is a tiny hitch instead of one big write every second
      // that lands in-phase with the ~1s sensor pushes and visibly stutters.
      timesliceMs: 250,
      // Cap the hardware H.264 bitrate so per-chunk temp writes stay small; VP8
      // keeps its default (full quality).
      videoBitsPerSecond: copy ? RECORD_H264_BPS : undefined,
      // Bound memory if the disk can't keep up: stop the take once too many
      // chunk writes are backed up rather than letting the queue grow forever.
      // ~40 chunks ≈ 10s at the 250ms timeslice.
      maxPendingChunks: 40,
      onOverflow: () => void stop(),
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
