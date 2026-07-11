// Live-streaming controller hook. Taps the SAME compositor canvas + mic the
// local recorder uses (one MediaRecorder at a time — App enforces mutual
// exclusion). Each chunk goes two independent ways:
//   1. write_stream_chunk → the RTMP ffmpeg (droppable under backpressure).
//   2. append_temp_chunk  → a local temp WebM (only when "save copy locally").
// The local take therefore keeps EVERY chunk at full quality even if the network
// lags/drops — it is never the network-throttled encode. On stop the temp WebM
// is transcoded to MP4 via the same proven pipeline the local recorder uses.
// Shares useCaptureTimer with the recorder so elapsed / FIXED auto-stop match.

import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { createRecorder, type Recorder } from "../recording/recorder";
import { useCaptureTimer, type RecMode } from "../recording/use-capture-timer";
import { makeRecordingName } from "../recording/output-naming";
import {
  startTempRecording,
  appendTempChunk,
  transcodeToMp4,
  remuxToMp4,
  moveTemp,
  type SavedFile,
} from "../recording/save-client";
import { pickStreamH264Mime } from "../recording/capability";
import type { StreamEncoderPref } from "../settings/config-store";
import { startStream, writeStreamChunk, stopStream, type StreamStatus } from "./stream-client";

// Live status as the UI sees it. "idle" collapses backend "ended" (a clean
// finish returns the controls to their resting state).
export type LiveState = "idle" | "connecting" | "live" | "unstable" | "error";

// Chunk cadence for live (vs 1000ms for local recording): lower latency + finer
// backpressure granularity.
const LIVE_TIMESLICE_MS = 500;

export interface UseStreamingRefs {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  micStreamRef: React.MutableRefObject<MediaStream | null>;
  mimeTypeRef: React.MutableRefObject<string | null>;
  personNameRef: React.MutableRefObject<string>;
  logNoRef: React.MutableRefObject<number>;
  outDirRef: React.MutableRefObject<string>;
  rtmpUrlRef: React.MutableRefObject<string>;
  streamKeyRef: React.MutableRefObject<string>;
  saveLocalRef: React.MutableRefObject<boolean>;
  streamHeightRef: React.MutableRefObject<number>;
  streamFpsRef: React.MutableRefObject<number>;
  streamBitrateKbpsRef: React.MutableRefObject<number>;
  streamEncoderRef: React.MutableRefObject<StreamEncoderPref>;
  /** Index the saved live take like a normal recording (library + log no.). */
  onSaved?: (file: SavedFile, durationSec: number) => void;
}

export function useStreaming(refs: UseStreamingRefs) {
  const [mode, setMode] = useState<RecMode>("free"); // live defaults to open-ended
  const [durationSec, setDurationSec] = useState(1800); // 30 min FIXED default
  const [state, setState] = useState<LiveState>("idle");
  const [dropped, setDropped] = useState(0);
  const [clamped, setClamped] = useState(false);
  const [saving, setSaving] = useState(false); // transcoding the local take
  const [copyActive, setCopyActive] = useState(false); // H.264 single-encode path engaged
  const [savedFile, setSavedFile] = useState<SavedFile | null>(null);
  const [transcodeProgress, setTranscodeProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const timer = useCaptureTimer({ mode, durationSec, onAutoStop: () => void stop() });
  const recRef = useRef<Recorder | null>(null);
  const tempPathRef = useRef<string>(""); // local temp (WebM or, in copy mode, MP4)
  const sessionSaveLocalRef = useRef<boolean>(false); // snapshot for this session
  const sessionCopyRef = useRef<boolean>(false); // H.264 copy path → local remux, not transcode
  const savingRef = useRef<boolean>(false); // guards saveLocalTake against overlapping calls
  const live = state !== "idle" && state !== "error";

  // Backend status → UI state. Single source of truth for the badge. A terminal
  // state (error) also finalizes the local take. Note: the auto-stop path clears
  // the backend session itself, and "ended" is just the echo of our own stop().
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listen<StreamStatus>("stream-status", (e) => {
      const s = e.payload;
      if (!s) return;
      setDropped(s.dropped);
      setClamped(s.clamped);
      if (s.state === "error") {
        setError(s.message ?? "Stream error");
        void finalizeLocal(); // keep the local take even though the stream died
        void stopStream().catch(() => {}); // clear the backend session (ffmpeg self-exit path)
        setState("error");
      } else if (s.state === "ended") {
        if (recRef.current) void finalizeLocal();
        setState((prev) => (prev === "error" ? "error" : "idle"));
      } else {
        setState(s.state); // connecting | live | unstable
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dismiss the "saved" notice after 10s.
  useEffect(() => {
    if (!savedFile) return;
    const t = window.setTimeout(() => setSavedFile(null), 10000);
    return () => clearTimeout(t);
  }, [savedFile]);

  // Stop the recorder + timer and transcode the local temp WebM to MP4 (if this
  // session was saving locally). Idempotent — the recRef guard makes a second
  // call (e.g. stop() then an "ended" echo) a no-op.
  async function finalizeLocal(): Promise<void> {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    const duration = timer.stop();
    try {
      await rec.stop(); // flush the final chunks (local append + RTMP write)
    } catch {
      /* recorder already gone */
    }
    await saveLocalTake(duration);
  }

  async function saveLocalTake(durationSec: number): Promise<void> {
    const temp = tempPathRef.current;
    tempPathRef.current = "";
    // Re-entrancy guard: an "error" event and a user stop() can both drive a save;
    // without this the second one duplicates the transcode + leaks its listener.
    if (!sessionSaveLocalRef.current || !temp || savingRef.current) return;
    savingRef.current = true;

    setSaving(true);
    setTranscodeProgress(0);
    const unlisten = await listen<number>("transcode-progress", (e) => setTranscodeProgress(e.payload));
    try {
      const person = refs.personNameRef.current;
      const logNo = refs.logNoRef.current;
      const outDir = refs.outDirRef.current;
      const copy = sessionCopyRef.current;
      const mp4Name = makeRecordingName(person, logNo, "mp4");
      let saved: SavedFile;
      try {
        // Copy path: the temp is already H.264 → remux (fast, full quality).
        // Otherwise transcode the VP8 temp to H.264 MP4.
        saved = copy
          ? await remuxToMp4(temp, mp4Name, outDir)
          : await transcodeToMp4(temp, mp4Name, outDir, durationSec, refs.streamEncoderRef.current !== "software");
      } catch (saveErr) {
        // Never lose the take: fall back to moving the raw temp file.
        saved = await moveTemp(temp, makeRecordingName(person, logNo, copy ? "mp4" : "webm"), outDir);
        setError(`MP4 finalize failed; saved raw. ${saveErr}`);
      }
      setSavedFile(saved);
      refs.onSaved?.(saved, durationSec);
    } catch (err) {
      setError(String(err));
    } finally {
      unlisten();
      setSaving(false);
      savingRef.current = false;
    }
  }

  async function start(): Promise<void> {
    const canvas = refs.canvasRef.current;
    if (!canvas || recRef.current) return;

    const url = refs.rtmpUrlRef.current.trim();
    const key = refs.streamKeyRef.current.trim();
    if (!url || !key) {
      setError("Streaming is not configured");
      setState("error");
      return;
    }

    // Encoder path. "software" forces VP8 re-encode; otherwise prefer a hardware
    // H.264 recorder → ffmpeg just remuxes (`-c copy`): no double encode, far less
    // CPU, no capture stutter. "hardware" that isn't supported falls back to VP8.
    const pref = refs.streamEncoderRef.current;
    const h264 = pref === "software" ? null : pickStreamH264Mime();
    const copy = h264 !== null;
    const mime = h264 ?? refs.mimeTypeRef.current;
    if (!mime) {
      setError("No supported recording codec");
      setState("error");
      return;
    }
    sessionCopyRef.current = copy;
    setCopyActive(copy);

    setSavedFile(null);
    setDropped(0);
    setState("connecting");
    // User asked for hardware but the webview can't record H.264 — stream anyway on
    // the software path, but tell them why the badge won't show `hw`.
    setError(pref === "hardware" && !copy ? "Hardware H.264 not available — using software encode" : null);

    // Open the local temp capture first (if saving) so no chunk is missed. In the
    // copy path the recorder emits MP4/H.264, otherwise WebM/VP8.
    sessionSaveLocalRef.current = refs.saveLocalRef.current;
    tempPathRef.current = "";
    if (sessionSaveLocalRef.current) {
      try {
        tempPathRef.current = await startTempRecording(copy ? "mp4" : "webm");
      } catch {
        sessionSaveLocalRef.current = false; // stream anyway, just without a local copy
      }
    }

    const fps = refs.streamFpsRef.current;
    const bitrateKbps = refs.streamBitrateKbpsRef.current;
    try {
      await startStream({ url, key, height: refs.streamHeightRef.current, fps, bitrateKbps, copy });
    } catch (err) {
      setError(String(err));
      setState("error");
      return;
    }

    recRef.current = createRecorder({
      canvas,
      micStream: refs.micStreamRef.current,
      mimeType: mime,
      fps, // fixed capture rate = the stream fps
      timesliceMs: LIVE_TIMESLICE_MS,
      // Cap the throwaway VP8 near the target so it isn't over-encoded (CPU).
      videoBitsPerSecond: bitrateKbps * 1000,
      onChunk: async (blob) => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        // RTMP write is FIRE-AND-FORGET: never await it here, so a stalled/dropped
        // network can't block the recorder chain and freeze the LOCAL recording.
        // Order is still fine — onChunk runs serialized, so writes are issued in
        // order, and the Rust writer thread feeds ffmpeg in receive order.
        void writeStreamChunk(bytes).catch(() => {});
        // Local append IS awaited → serialized by the chain → correct file order,
        // and it only touches local disk, so it's independent of the network.
        if (sessionSaveLocalRef.current && tempPathRef.current) {
          await appendTempChunk(tempPathRef.current, bytes);
        }
      },
    });
    recRef.current.start();
    timer.start();
  }

  async function stop(): Promise<void> {
    // Never overwrite a terminal error with idle — if the backend errored while we
    // were stopping, the LIVE ERROR + its reason must stay until the user switches
    // tabs (reset). A clean stop with no error goes to idle.
    const toRest = () => setState((prev) => (prev === "error" ? "error" : "idle"));
    const rec = recRef.current;
    if (!rec) {
      await stopStream().catch(() => {});
      toRest();
      return;
    }
    recRef.current = null;
    const duration = timer.stop();
    try {
      await rec.stop(); // flush the final chunks BEFORE closing the backend
    } catch {
      /* ignore */
    }
    await stopStream().catch((err) => setError(String(err))); // end the broadcast promptly
    toRest();
    await saveLocalTake(duration); // transcode the local take (shows the saving overlay)
  }

  // Clear a terminal state (e.g. a lingering LIVE ERROR + its message) so it
  // doesn't persist after the user switches away. No-op while actively capturing.
  function reset(): void {
    if (recRef.current) return;
    setState("idle");
    setError(null);
    setDropped(0);
  }

  return {
    reset,
    mode,
    setMode,
    durationSec,
    setDurationSec,
    state,
    live,
    dropped,
    clamped,
    copyActive,
    elapsedSec: timer.elapsedSec,
    paused: timer.paused,
    saving,
    savedFile,
    transcodeProgress,
    error,
    start,
    stop,
  };
}
