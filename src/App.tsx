import { useCallback, useEffect, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
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
import { getLayout, listLayouts } from "./hud/layout-registry";
import { createHudDataSource, type HudDataSource } from "./data/hud-data-source";
import { createAudioAnalyser, type AudioAnalyser } from "./hud/audio-analyser";
import { useRecorder } from "./recording/use-recorder";
import { RecordingControls } from "./recording/recording-controls";
import { SettingsPanel } from "./settings/settings-panel";
import { loadConfig, saveConfig, DEFAULT_CONFIG, type AppConfig } from "./settings/config-store";
import { PinGate } from "./auth/pin-gate";
import { hasPin } from "./auth/auth-client";
import { LibraryView } from "./library/library-view";
import { addEntry, updateEntry } from "./library/entries-store";
import { generateThumbnail } from "./library/library-client";
import type { SavedFile } from "./recording/save-client";
import { HudSelect } from "./components/hud-select";
import "./App.css";

type Status = "init" | "requesting" | "ready" | "error";

const CAPTURE_WIDTH = 1920;
const CAPTURE_HEIGHT = 1080;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositorRef = useRef<CanvasCompositor | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AudioAnalyser | null>(null);
  const dataSourceRef = useRef<HudDataSource | null>(null);
  const hudUnsubRef = useRef<(() => void) | null>(null);
  const cameraLabelRef = useRef<string>("CAM");
  // Recorder / HUD inputs (refs so async code always reads current values).
  const mimeTypeRef = useRef<string | null>(null);
  const personNameRef = useRef<string>(DEFAULT_CONFIG.personName);
  const logNoRef = useRef<number>(DEFAULT_CONFIG.logNo);
  const outDirRef = useRef<string>(DEFAULT_CONFIG.outputDir);
  const audioEnabledRef = useRef<boolean>(DEFAULT_CONFIG.audioEnabled);
  const layoutIdRef = useRef<string>(DEFAULT_CONFIG.layoutId);
  const mirrorRef = useRef<boolean>(DEFAULT_CONFIG.mirror);
  const crtRef = useRef<boolean>(DEFAULT_CONFIG.crtEffect);
  const genRef = useRef(0);

  const [status, setStatus] = useState<Status>("init");
  const [error, setError] = useState<string>("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [micId, setMicId] = useState<string>("");
  const [capability, setCapability] = useState<RecordingCapability | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [pinMode, setPinMode] = useState<"set" | "enter">("enter");
  const [unlocked, setUnlocked] = useState(false);

  const rec = useRecorder({
    canvasRef,
    micStreamRef: audioStreamRef,
    mimeTypeRef,
    personNameRef,
    logNoRef,
    outDirRef,
    onSaved: handleSaved,
  });

  // Stable per-frame HUD state provider (reads refs, so it never goes stale).
  const getState = useCallback(() => {
    const s = dataSourceRef.current!.getState();
    s.audioBars = analyserRef.current?.sampleBars(56) ?? null;
    s.cameraLabel = cameraLabelRef.current;
    s.personName = personNameRef.current;
    s.logNo = logNoRef.current;
    return s;
  }, []);

  // (Re)register the HUD layer for the current layout id.
  const registerHud = useCallback(() => {
    if (!compositorRef.current) return;
    hudUnsubRef.current?.();
    hudUnsubRef.current = compositorRef.current.registerLayer(
      createHudLayer(getLayout(layoutIdRef.current), getState),
    );
  }, [getState]);

  // Decide whether to onboard a PIN or ask for one.
  useEffect(() => {
    (async () => {
      try {
        setPinMode((await hasPin()) ? "enter" : "set");
      } catch {
        setPinMode("set");
      }
      setAuthReady(true);
    })();
  }, []);

  // Camera/HUD init runs only after unlock. Load config, probe, preview.
  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    const cap = probeRecordingCapability();
    setCapability(cap);
    mimeTypeRef.current = cap.supportedMimeType;

    (async () => {
      setStatus("requesting");
      try {
        const cfg = await loadConfig();
        if (cancelled) return;
        applyConfigToRefs(cfg);
        setConfig(cfg);
        rec.setDurationSec(cfg.durationMin * 60);
        dataSourceRef.current = createHudDataSource(cfg.cityOverride);

        await requestPermission(cfg.audioEnabled);
        const devices = await enumerateDevices();
        if (cancelled) return;
        setCameras(devices.cameras);
        setMics(devices.mics);
        const cam = devices.cameras[0]?.deviceId ?? "";
        const mic = devices.mics[0]?.deviceId ?? "";
        setCameraId(cam);
        setMicId(mic);
        await startAudio(mic);
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
      genRef.current++;
      hudUnsubRef.current?.();
      hudUnsubRef.current = null;
      compositorRef.current?.stop();
      compositorRef.current = null; // fresh compositor binds the remounted canvas on re-unlock
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
  }, [unlocked]);

  // Keep the HUD camera label in sync with the selected camera device.
  useEffect(() => {
    const cam = cameras.find((c) => c.deviceId === cameraId);
    if (cam?.label) cameraLabelRef.current = cam.label;
  }, [cameraId, cameras]);

  function applyConfigToRefs(cfg: AppConfig) {
    personNameRef.current = cfg.personName;
    logNoRef.current = cfg.logNo;
    outDirRef.current = cfg.outputDir;
    audioEnabledRef.current = cfg.audioEnabled;
    layoutIdRef.current = cfg.layoutId;
    mirrorRef.current = cfg.mirror;
    crtRef.current = cfg.crtEffect;
  }

  // Swap the camera video only (open-before-close + generation guard). A static
  // burst covers the switch gap and lands in the recording.
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
      compositorRef.current.setCrt(crtRef.current);
      if (!dataSourceRef.current) dataSourceRef.current = createHudDataSource();
      registerHud();
    }
    await compositorRef.current.start(stream);

    if (gen !== genRef.current) {
      stopStream(stream);
      return;
    }
    stopStream(previous);
  }

  // (Re)open the mic + analyser. No-op when audio is disabled. Not called
  // mid-recording (the recorder holds the current mic track).
  async function startAudio(micDeviceId: string) {
    if (!audioEnabledRef.current) return;
    const stream = await openAudioStream(micDeviceId || undefined);
    const previous = audioStreamRef.current;
    audioStreamRef.current = stream;
    analyserRef.current?.dispose();
    analyserRef.current = createAudioAnalyser(stream);
    stopStream(previous);
  }

  function stopAudio() {
    analyserRef.current?.dispose();
    analyserRef.current = null;
    stopStream(audioStreamRef.current);
    audioStreamRef.current = null;
  }

  async function onCameraChange(nextCameraId: string) {
    if (nextCameraId === cameraId) return;
    setCameraId(nextCameraId);
    try {
      await startVideo(nextCameraId, true);
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  async function onMicChange(nextMicId: string) {
    if (nextMicId === micId || rec.recording) return;
    setMicId(nextMicId);
    try {
      await startAudio(nextMicId);
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }

  // After each successful save: index the entry (+ thumbnail) and advance the log #.
  function handleSaved(file: SavedFile, durationSec: number) {
    const usedLogNo = logNoRef.current;
    const city = dataSourceRef.current?.getState().location ?? "";
    const id = `${Date.now()}-${usedLogNo}`;
    void addEntry({
      id,
      name: personNameRef.current,
      logNo: usedLogNo,
      dateISO: new Date().toISOString(),
      city,
      durationSec,
      path: file.path,
      size: file.size,
      thumbPath: "",
    })
      .then(() => generateThumbnail(file.path, id))
      .then((thumb) => updateEntry(id, { thumbPath: thumb }))
      .catch(() => {
        /* thumbnail is best-effort */
      });

    const next = usedLogNo + 1;
    logNoRef.current = next;
    setConfig((c) => {
      const n = { ...c, logNo: next };
      void saveConfig(n);
      return n;
    });
  }

  function setField<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  async function browseFolder() {
    const dir = await openDialog({ directory: true });
    if (typeof dir === "string") setField("outputDir", dir);
  }

  async function applySettings() {
    await saveConfig(config);
    const audioWas = audioEnabledRef.current;
    applyConfigToRefs(config);
    compositorRef.current?.setMirror(config.mirror);
    compositorRef.current?.setCrt(config.crtEffect);
    rec.setDurationSec(config.durationMin * 60);
    dataSourceRef.current?.setCityOverride(config.cityOverride);
    registerHud(); // re-apply layout

    if (config.audioEnabled !== audioWas && !rec.recording) {
      if (config.audioEnabled) await startAudio(micId);
      else stopAudio();
    }
    setSettingsOpen(false);
  }

  if (!authReady) return <div className="stage" />;
  if (!unlocked) return <PinGate mode={pinMode} onUnlocked={() => setUnlocked(true)} />;

  return (
    <div className="stage">
      <canvas ref={canvasRef} className="preview-canvas" />

      <header className="topbar">
        <span className="brand">LAZY CAMERA HUD</span>
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
          <button className="icon-btn" onClick={() => setLibraryOpen(true)} title="Library">
            ▤
          </button>
          <button
            className="icon-btn"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            ⚙
          </button>
          <HudSelect
            title="Camera"
            value={cameraId}
            options={cameras.map((c, i) => ({ id: c.deviceId, label: c.label || `Camera ${i + 1}` }))}
            onChange={(id) => void onCameraChange(id)}
          />
          <HudSelect
            title={rec.recording ? "Mic can't be changed while recording" : "Microphone"}
            value={micId}
            disabled={rec.recording || !config.audioEnabled}
            options={mics.map((m, i) => ({ id: m.deviceId, label: m.label || `Mic ${i + 1}` }))}
            onChange={(id) => void onMicChange(id)}
          />
          <button
            className="icon-btn"
            onClick={() => {
              setPinMode("enter");
              setUnlocked(false);
            }}
            title="Lock"
          >
            ⏻
          </button>
        </div>
      )}

      {libraryOpen && <LibraryView onClose={() => setLibraryOpen(false)} />}

      {settingsOpen && (
        <SettingsPanel
          config={config}
          setField={setField}
          layouts={listLayouts()}
          onBrowse={() => void browseFolder()}
          onClose={() => setSettingsOpen(false)}
          onSave={() => void applySettings()}
        />
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
