import { useEffect, useRef, useState } from "react";
import { CanvasCompositor } from "./compositor/canvas-compositor";
import {
  enumerateDevices,
  openStream,
  requestPermission,
  stopStream,
  PermissionDeniedError,
} from "./compositor/media-devices";
import { probeRecordingCapability, type RecordingCapability } from "./recording/capability";
import { createHudLayer } from "./hud/layout-engine";
import { getLayout, DEFAULT_LAYOUT_ID } from "./hud/layout-registry";
import { createHudDataSource, type HudDataSource } from "./data/hud-data-source";
import { createAudioAnalyser, type AudioAnalyser } from "./hud/audio-analyser";
import { useRecorder } from "./recording/use-recorder";
import { RecordingControls } from "./recording/recording-controls";
import "./App.css";

type Status = "init" | "requesting" | "ready" | "error";

const CAPTURE_WIDTH = 1920;
const CAPTURE_HEIGHT = 1080;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositorRef = useRef<CanvasCompositor | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AudioAnalyser | null>(null);
  const dataSourceRef = useRef<HudDataSource | null>(null);
  // Friendly name of the selected camera, shown as the HUD camera label.
  const cameraLabelRef = useRef<string>("CAM");
  // Recorder inputs (refs so the recorder always reads current values).
  const mimeTypeRef = useRef<string | null>(null);
  const personNameRef = useRef<string>("Harry");
  // Monotonic generation guard: only the latest startPreview call may bind a
  // stream. Protects against StrictMode double-mount + rapid device switching
  // resolving getUserMedia out of order (which would leak camera/mic tracks).
  const genRef = useRef(0);

  const [status, setStatus] = useState<Status>("init");
  const [error, setError] = useState<string>("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [micId, setMicId] = useState<string>("");
  const [capability, setCapability] = useState<RecordingCapability | null>(null);

  const rec = useRecorder({ canvasRef, micStreamRef: streamRef, mimeTypeRef, personNameRef });

  // One-time init: probe capability, request permission, list devices, preview.
  useEffect(() => {
    let cancelled = false;
    const cap = probeRecordingCapability();
    setCapability(cap);
    mimeTypeRef.current = cap.supportedMimeType;

    (async () => {
      setStatus("requesting");
      try {
        await requestPermission(true);
        const devices = await enumerateDevices();
        if (cancelled) return;
        setCameras(devices.cameras);
        setMics(devices.mics);
        const cam = devices.cameras[0]?.deviceId ?? "";
        const mic = devices.mics[0]?.deviceId ?? "";
        setCameraId(cam);
        setMicId(mic);
        await startPreview(cam, mic);
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof PermissionDeniedError ? err.message : String(err));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      genRef.current++; // invalidate any in-flight startPreview
      compositorRef.current?.stop();
      analyserRef.current?.dispose();
      analyserRef.current = null;
      dataSourceRef.current?.dispose();
      dataSourceRef.current = null;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the HUD camera label in sync with the selected camera device.
  useEffect(() => {
    const cam = cameras.find((c) => c.deviceId === cameraId);
    if (cam?.label) cameraLabelRef.current = cam.label;
  }, [cameraId, cameras]);

  // Open the new stream BEFORE tearing down the old one (open-before-close), so
  // a failed openStream leaves the working preview intact, and stale streams
  // from superseded calls are always stopped rather than leaked.
  async function startPreview(camDeviceId: string, micDeviceId: string) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gen = ++genRef.current;

    const stream = await openStream({
      cameraDeviceId: camDeviceId || undefined,
      micDeviceId: micDeviceId || undefined,
      audio: true,
      width: CAPTURE_WIDTH,
      height: CAPTURE_HEIGHT,
    });

    // A newer call (or unmount) superseded us while awaiting: discard our stream.
    if (gen !== genRef.current) {
      stopStream(stream);
      return;
    }

    const previous = streamRef.current;
    streamRef.current = stream;

    // (Re)build the mic analyser for the new stream so the soundwave reflects it.
    analyserRef.current?.dispose();
    analyserRef.current = createAudioAnalyser(stream);

    if (!compositorRef.current) {
      compositorRef.current = new CanvasCompositor(canvas);
      // Data-driven HUD layer (Phase 2). Mock gauges + real mic waveform.
      if (!dataSourceRef.current) dataSourceRef.current = createHudDataSource();
      const getState = () => {
        const s = dataSourceRef.current!.getState();
        s.audioBars = analyserRef.current?.sampleBars(56) ?? null;
        s.cameraLabel = cameraLabelRef.current;
        return s;
      };
      compositorRef.current.registerLayer(createHudLayer(getLayout(DEFAULT_LAYOUT_ID), getState));
    }
    await compositorRef.current.start(stream);

    if (gen !== genRef.current) {
      // Superseded during start(): the winning call owns streamRef now.
      stopStream(stream);
      return;
    }
    stopStream(previous); // new preview is live; safe to release the old stream
  }

  async function onDeviceChange(nextCameraId: string, nextMicId: string) {
    if (nextCameraId === cameraId && nextMicId === micId) return; // no-op re-select
    setCameraId(nextCameraId);
    setMicId(nextMicId);
    try {
      setStatus("requesting");
      await startPreview(nextCameraId, nextMicId);
      setStatus("ready");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  return (
    <div className="stage">
      <canvas ref={canvasRef} className="preview-canvas" />

      <header className="topbar">
        <span className="brand">LAZY VLOG RECORDER</span>
        {rec.recording ? (
          <span className="cap-badge recording">
            <span className="rec-dot" />
            {rec.mode === "fixed" ? "-" : ""}
            {fmtClock(rec.mode === "fixed" ? Math.max(0, rec.durationSec - rec.elapsedSec) : rec.elapsedSec)}
          </span>
        ) : (
          capability && (
            <span className={`cap-badge ${capability.ok ? "ok" : "warn"}`}>
              {capability.ok
                ? `REC READY · ${shortMime(capability.supportedMimeType)}`
                : "REC UNSUPPORTED"}
            </span>
          )
        )}
      </header>

      {status === "ready" && (
        <RecordingControls
          mode={rec.mode}
          setMode={rec.setMode}
          durationSec={rec.durationSec}
          setDurationSec={rec.setDurationSec}
          recording={rec.recording}
          savedPath={rec.savedPath}
          saving={rec.saving}
          error={rec.error}
          disabled={!capability?.ok}
          onStart={rec.start}
          onStop={() => void rec.stop()}
        />
      )}

      {status === "ready" && (
        <div className="controls">
          <label>
            CAM
            <select value={cameraId} onChange={(e) => onDeviceChange(e.target.value, micId)}>
              {cameras.map((c, i) => (
                <option key={c.deviceId || i} value={c.deviceId}>
                  {c.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            MIC
            <select value={micId} onChange={(e) => onDeviceChange(cameraId, e.target.value)}>
              {mics.map((m, i) => (
                <option key={m.deviceId || i} value={m.deviceId}>
                  {m.label || `Mic ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {status === "requesting" && (
        <div className="overlay">Requesting camera &amp; microphone…</div>
      )}
      {status === "error" && (
        <div className="overlay error">
          <p>{error}</p>
          <button onClick={() => location.reload()}>Retry</button>
        </div>
      )}
    </div>
  );
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function shortMime(mime: string | null): string {
  if (!mime) return "?";
  if (mime.includes("mp4")) return "MP4";
  if (mime.includes("vp9")) return "WEBM/VP9";
  if (mime.includes("vp8")) return "WEBM/VP8";
  return "WEBM";
}
