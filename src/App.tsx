import { useEffect, useRef, useState } from "react";
import { CanvasCompositor } from "./compositor/canvas-compositor";
import {
  enumerateDevices,
  openVideoStream,
  openAudioStream,
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
  // Video (camera) and audio (mic) streams are kept separate so switching the
  // camera mid-recording only swaps video — the mic track the recorder holds
  // stays live and recording continues.
  const videoStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AudioAnalyser | null>(null);
  const dataSourceRef = useRef<HudDataSource | null>(null);
  // Friendly name of the selected camera, shown as the HUD camera label.
  const cameraLabelRef = useRef<string>("CAM");
  // Recorder inputs (refs so the recorder always reads current values).
  const mimeTypeRef = useRef<string | null>(null);
  const personNameRef = useRef<string>("Harry");
  const mirrorRef = useRef<boolean>(true); // default mirrored (natural selfie)
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
  const [mirrored, setMirrored] = useState<boolean>(true);
  const [capability, setCapability] = useState<RecordingCapability | null>(null);

  const rec = useRecorder({ canvasRef, micStreamRef: audioStreamRef, mimeTypeRef, personNameRef });

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
        await startAudio(mic); // persistent mic before video
        await startVideo(cam, false);
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof PermissionDeniedError ? err.message : String(err));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      genRef.current++; // invalidate any in-flight startVideo
      compositorRef.current?.stop();
      analyserRef.current?.dispose();
      analyserRef.current = null;
      dataSourceRef.current?.dispose();
      dataSourceRef.current = null;
      stopStream(videoStreamRef.current);
      stopStream(audioStreamRef.current);
      videoStreamRef.current = null;
      audioStreamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the HUD camera label in sync with the selected camera device.
  useEffect(() => {
    const cam = cameras.find((c) => c.deviceId === cameraId);
    if (cam?.label) cameraLabelRef.current = cam.label;
  }, [cameraId, cameras]);

  // Swap the camera video only. Uses a generation guard + open-before-close so a
  // failed switch keeps the current preview. `withTransition` plays a static
  // burst over the gap (the canvas keeps recording, so it lands in the video).
  async function startVideo(camDeviceId: string, withTransition: boolean) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gen = ++genRef.current;

    if (withTransition) compositorRef.current?.triggerSwitchTransition(700);

    const stream = await openVideoStream({
      cameraDeviceId: camDeviceId || undefined,
      width: CAPTURE_WIDTH,
      height: CAPTURE_HEIGHT,
    });
    if (gen !== genRef.current) {
      stopStream(stream);
      return;
    }

    const previous = videoStreamRef.current;
    videoStreamRef.current = stream;

    if (!compositorRef.current) {
      compositorRef.current = new CanvasCompositor(canvas);
      compositorRef.current.setMirror(mirrorRef.current);
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
      stopStream(stream);
      return;
    }
    stopStream(previous);
  }

  // (Re)open the mic and rebuild the analyser. Not called mid-recording (the
  // recorder holds the current mic track).
  async function startAudio(micDeviceId: string) {
    const stream = await openAudioStream(micDeviceId || undefined);
    const previous = audioStreamRef.current;
    audioStreamRef.current = stream;
    analyserRef.current?.dispose();
    analyserRef.current = createAudioAnalyser(stream);
    stopStream(previous);
  }

  async function onCameraChange(nextCameraId: string) {
    if (nextCameraId === cameraId) return;
    setCameraId(nextCameraId);
    try {
      // Static transition; preview/recording stays live (no status overlay).
      await startVideo(nextCameraId, true);
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  function toggleMirror() {
    const next = !mirrored;
    setMirrored(next);
    mirrorRef.current = next;
    compositorRef.current?.setMirror(next);
  }

  async function onMicChange(nextMicId: string) {
    if (nextMicId === micId || rec.recording) return; // can't swap mic mid-record
    setMicId(nextMicId);
    try {
      await startAudio(nextMicId);
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
          savedFile={rec.savedFile}
          saving={rec.saving}
          error={rec.error}
          disabled={!capability?.ok}
          onStart={rec.start}
          onStop={() => void rec.stop()}
        />
      )}

      {status === "ready" && (
        <div className="controls">
          <button
            className={`mirror-btn ${mirrored ? "active" : ""}`}
            onClick={toggleMirror}
            title={mirrored ? "Mirror: on" : "Mirror: off"}
          >
            ⇋
          </button>
          <label>
            CAM
            <select value={cameraId} onChange={(e) => void onCameraChange(e.target.value)}>
              {cameras.map((c, i) => (
                <option key={c.deviceId || i} value={c.deviceId}>
                  {c.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            MIC
            <select
              value={micId}
              disabled={rec.recording}
              title={rec.recording ? "Mic can't be changed while recording" : undefined}
              onChange={(e) => void onMicChange(e.target.value)}
            >
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
