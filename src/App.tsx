import { useCallback, useEffect, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CanvasCompositor } from "./compositor/canvas-compositor";
import {
  enumerateDevices,
  openVideoStream,
  openAudioStream,
  requestPermission,
  stopStream,
  PermissionDeniedError,
} from "./compositor/media-devices";
import { probeRecordingCapability, pickStreamH264Mime, type RecordingCapability } from "./recording/capability";
import { createHudLayer } from "./hud/layout-engine";
import { getLayout, listLayouts } from "./hud/layout-registry";
import { getTheme, listThemes } from "./hud/theme-registry";
import { createHudDataSource, type HudDataSource } from "./data/hud-data-source";
import { createSystemVitalsSource, type SystemVitalsSource } from "./data/system-vitals-client";
import { createAudioAnalyser, type AudioAnalyser } from "./hud/audio-analyser";
import { useRecorder } from "./recording/use-recorder";
import { isEditableTarget, cameraDeviceIdForKey } from "./recording/keyboard-shortcuts";
import { RecordingControls, type Destination } from "./recording/recording-controls";
import { useStreaming } from "./streaming/use-streaming";
import { SettingsPanel } from "./settings/settings-panel";
import { isStreamConfigured } from "./settings/is-stream-configured";
import { loadConfig, saveConfig, generateToken, DEFAULT_CONFIG, type AppConfig } from "./settings/config-store";
import { isIOS } from "./platform/platform";
import { PinGate } from "./auth/pin-gate";
import { hasPin } from "./auth/auth-client";
import { LibraryView } from "./library/library-view";
import { addEntry, updateEntry } from "./library/entries-store";
import { generateThumbnail } from "./library/thumbnail";
import type { SavedFile } from "./recording/save-client";
import type { SensorItem, SeriesItem } from "./hud/types";
import { HudSelect } from "./components/hud-select";
import "./App.css";

const SENSOR_STALE_MS = 10_000; // dim sensor rows not refreshed within this window
const SENSOR_HIDE_MS = 30_000; // fully hide sensor/series after this much silence
const SERIES_MAX_POINTS = 120; // rolling window kept per sparkline series

interface SeriesBuf {
  points: number[];
  value: number;
  unit: string;
  at: number;
}

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
  const vitalsSourceRef = useRef<SystemVitalsSource | null>(null);
  const hudUnsubRef = useRef<(() => void) | null>(null);
  const cameraLabelRef = useRef<string>("CAM");
  // Recorder / HUD inputs (refs so async code always reads current values).
  const mimeTypeRef = useRef<string | null>(null);
  const personNameRef = useRef<string>(DEFAULT_CONFIG.personName);
  const logNoRef = useRef<number>(DEFAULT_CONFIG.logNo);
  const missionDayTextRef = useRef<string>(DEFAULT_CONFIG.missionDayText);
  const outDirRef = useRef<string>(DEFAULT_CONFIG.outputDir);
  const audioEnabledRef = useRef<boolean>(DEFAULT_CONFIG.audioEnabled);
  const layoutIdRef = useRef<string>(DEFAULT_CONFIG.layoutId);
  const themeIdRef = useRef<string>(DEFAULT_CONFIG.themeId);
  const mirrorRef = useRef<boolean>(DEFAULT_CONFIG.mirror);
  const crtRef = useRef<boolean>(DEFAULT_CONFIG.crtEffect);
  const recordHeightRef = useRef<number>(DEFAULT_CONFIG.recordHeight);
  // Streaming inputs (refs so useStreaming reads current values at start()).
  const rtmpUrlRef = useRef<string>(DEFAULT_CONFIG.rtmpUrl);
  const streamKeyRef = useRef<string>(DEFAULT_CONFIG.streamKey);
  const saveLocalWhileLiveRef = useRef<boolean>(DEFAULT_CONFIG.saveLocalWhileLive);
  const streamFpsRef = useRef<number>(DEFAULT_CONFIG.streamFps);
  const streamBitrateKbpsRef = useRef<number>(DEFAULT_CONFIG.streamBitrateKbps);
  const streamEncoderRef = useRef(DEFAULT_CONFIG.streamEncoder);
  const genRef = useRef(0);
  // Latest external sensor readings + when they arrived (for staleness).
  const sensorsRef = useRef<{ items: SensorItem[]; at: number }>({ items: [], at: 0 });
  // Rolling per-label buffers for /series sparklines.
  const seriesRef = useRef<Map<string, SeriesBuf>>(new Map());
  // Render-ready caches, rebuilt on each push (not per frame). getState only
  // flips the time-based `stale` flag in place — no per-frame allocation, so
  // pushing many sensor/series labels doesn't create GC pressure that stutters
  // the video. `series` points reference the live buffers (widgets read-only).
  const sensorsRenderRef = useRef<SensorItem[]>([]);
  const seriesRenderRef = useRef<SeriesItem[]>([]);
  // Latest /text caption (typewriter widget).
  const captionRef = useRef<{ text: string; at: number; typing: boolean }>({
    text: "",
    at: 0,
    typing: true,
  });

  const [status, setStatus] = useState<Status>("init");
  const [error, setError] = useState<string>("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [micId, setMicId] = useState<string>("");
  const [capability, setCapability] = useState<RecordingCapability | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  // Last config actually persisted to disk. Lets layout/theme live-apply persist
  // just their own field without committing other unsaved edits in the panel.
  const savedConfigRef = useRef<AppConfig>(DEFAULT_CONFIG);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [destination, setDestination] = useState<Destination>("local");
  const [confirmLive, setConfirmLive] = useState(false);
  const [renderFps, setRenderFps] = useState(0); // live compositor draw rate for the badge
  const [renderMs, setRenderMs] = useState(0); // per-frame draw time (render-cost readout)
  const [authReady, setAuthReady] = useState(false);
  const [pinMode, setPinMode] = useState<"set" | "enter">("enter");
  const [unlocked, setUnlocked] = useState(false);
  // Sensor API on-screen status (not burned into the recording): whether the
  // server is bound + listening, and whether data arrived recently (dot pulse).
  const [apiListening, setApiListening] = useState(false);
  const [apiActive, setApiActive] = useState(false);
  const apiLastDataRef = useRef(0);

  const rec = useRecorder({
    canvasRef,
    micStreamRef: audioStreamRef,
    mimeTypeRef,
    personNameRef,
    logNoRef,
    outDirRef,
    encoderPrefRef: streamEncoderRef,
    onSaved: handleSaved,
  });

  const streaming = useStreaming({
    canvasRef,
    micStreamRef: audioStreamRef,
    mimeTypeRef,
    personNameRef,
    logNoRef,
    outDirRef,
    rtmpUrlRef,
    streamKeyRef,
    saveLocalRef: saveLocalWhileLiveRef,
    recordHeightRef,
    streamFpsRef,
    streamBitrateKbpsRef,
    streamEncoderRef,
    onSaved: handleSaved, // index the saved live take like a normal recording
  });

  const streamConfigured = isStreamConfigured(config);

  // Codec the record path will actually capture: hardware H.264 (fast remux) when
  // the webview supports it and the encoder isn't forced to software, else the VP8
  // fallback. The old badge showed `supportedMimeType` from a VP8-first probe, so
  // it always read WEBM/VP8 regardless of H.264 support — misleading. Mirror the
  // real decision in use-recorder/use-streaming here.
  const recordCodecLabel =
    config.streamEncoder !== "software" && pickStreamH264Mime() !== null ? "MP4/H264" : "WEBM/VP8";

  // Compact Sensor API endpoint appended inside the capture badge — on-screen
  // only, never burned into the recording. The dot shows the server is listening
  // and pulses when a reading arrives.
  const apiInfo = config.sensorApiEnabled ? (
    <span className={`api-inline ${apiListening ? (apiActive ? "active" : "on") : "off"}`}>
      {" · "}
      <span className="api-dot" />
      {` API ${config.sensorApiBindHost}:${config.sensorApiPort}`}
    </span>
  ) : null;

  // Stable per-frame HUD state provider (reads refs, so it never goes stale).
  const getState = useCallback(() => {
    const s = dataSourceRef.current!.getState();
    s.audioBars = analyserRef.current?.sampleBars(56) ?? null;
    s.cameraLabel = cameraLabelRef.current;
    s.personName = personNameRef.current;
    s.logNo = logNoRef.current;
    s.missionDayText = missionDayTextRef.current;
    const now = performance.now();
    // Sensors + series render arrays are built on push (see the event listeners);
    // per frame we only refresh the time-based `stale` flag in place. This keeps
    // the hot path allocation-free so heavy sensor pushing can't stutter capture.
    const sensorsRender = sensorsRenderRef.current;
    const sensorsAge = now - sensorsRef.current.at;
    if (sensorsRender.length && sensorsAge <= SENSOR_HIDE_MS) {
      const stale = sensorsAge > SENSOR_STALE_MS; // dim before hiding
      for (const it of sensorsRender) it.stale = stale;
      s.sensors = sensorsRender;
    } else {
      s.sensors = undefined; // no data / silent too long → hide the panel
    }

    const seriesRender = seriesRenderRef.current;
    // Show series only while at least one buffer is within the hide window (find
    // the newest last-update; cheap, allocation-free).
    let newestSeriesAt = 0;
    if (seriesRender.length) {
      for (const item of seriesRender) {
        const buf = seriesRef.current.get(item.label);
        const at = buf ? buf.at : 0;
        if (at > newestSeriesAt) newestSeriesAt = at;
        item.stale = now - at > SENSOR_STALE_MS;
      }
    }
    s.series =
      seriesRender.length && now - newestSeriesAt <= SENSOR_HIDE_MS ? seriesRender : undefined;

    const cap = captionRef.current;
    s.caption = cap.text ? { text: cap.text, typing: cap.typing, sinceMs: now - cap.at } : undefined;

    s.vitals = vitalsSourceRef.current?.getVitals();
    return s;
  }, []);

  // (Re)register the HUD layer for the current layout id.
  const registerHud = useCallback(() => {
    if (!compositorRef.current) return;
    hudUnsubRef.current?.();
    hudUnsubRef.current = compositorRef.current.registerLayer(
      createHudLayer(getLayout(layoutIdRef.current), getState, getTheme(themeIdRef.current)),
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
        savedConfigRef.current = cfg;
        rec.setDurationSec(cfg.durationMin * 60);
        dataSourceRef.current = createHudDataSource(cfg.cityOverride);
        vitalsSourceRef.current = createSystemVitalsSource(cfg.showVitals);

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
        if (!cancelled) {
          setStatus("ready"); // a dedicated effect starts the sensor server on ready
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof PermissionDeniedError ? err.message : String(err));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      genRef.current++;
      // Finalize an in-progress LOCAL recording BEFORE tearing down the streams,
      // so locking/unmounting saves + indexes the take (from the temp file) instead
      // of orphaning it. No-op if not recording (rec.stop guards on its own ref).
      void rec.stop();
      hudUnsubRef.current?.();
      hudUnsubRef.current = null;
      compositorRef.current?.stop();
      compositorRef.current = null; // fresh compositor binds the remounted canvas on re-unlock
      analyserRef.current?.dispose();
      analyserRef.current = null;
      dataSourceRef.current?.dispose();
      dataSourceRef.current = null;
      vitalsSourceRef.current?.dispose();
      vitalsSourceRef.current = null;
      stopStream(videoStreamRef.current);
      stopStream(audioStreamRef.current);
      videoStreamRef.current = null;
      audioStreamRef.current = null;
      void invoke("stop_sensor_server");
      void streaming.stop(); // release the live recorder + close ffmpeg on lock/unmount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  // Receive sensor readings / series points pushed to the local HTTP API.
  useEffect(() => {
    if (!unlocked) return;
    // Guard against the async listen() resolving AFTER cleanup: without this,
    // StrictMode's mount→cleanup→mount (and every lock/unlock) leaks listeners,
    // so each sensor event fires more and more handlers over time → growing jank.
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const track = (fn: () => void) => (disposed ? fn() : unlisteners.push(fn));
    void listen<SensorItem[]>("sensors", (e) => {
      apiLastDataRef.current = performance.now(); // pulse the API status dot
      const items = e.payload ?? [];
      sensorsRef.current = { items, at: performance.now() };
      // Rebuild the render array here (on push, ~1×/s) not per frame.
      sensorsRenderRef.current = items.map((it) => ({ ...it }));
    }).then(track);
    void listen<{ label: string; value: number; unit: string }>("series", (e) => {
      apiLastDataRef.current = performance.now(); // pulse the API status dot
      const p = e.payload;
      if (!p || !Number.isFinite(p.value)) return;
      const map = seriesRef.current;
      const buf = map.get(p.label) ?? { points: [], value: p.value, unit: p.unit, at: 0 };
      buf.points.push(p.value);
      if (buf.points.length > SERIES_MAX_POINTS) buf.points.shift();
      buf.value = p.value;
      buf.unit = p.unit;
      buf.at = performance.now();
      map.set(p.label, buf);
      // Rebuild the render array on push; entries reference the LIVE points
      // buffers (widgets only read them), so no per-frame copy is needed.
      const render: SeriesItem[] = [];
      map.forEach((b, label) => {
        if (b.points.length) {
          render.push({ label, value: fmtSeriesValue(b.value), unit: b.unit, points: b.points });
        }
      });
      seriesRenderRef.current = render;
    }).then(track);
    void listen<{ text: string; typing: boolean }>("text", (e) => {
      apiLastDataRef.current = performance.now(); // pulse the API status dot
      const p = e.payload;
      if (!p) return;
      captionRef.current = { text: p.text ?? "", at: performance.now(), typing: p.typing !== false };
    }).then(track);
    return () => {
      disposed = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [unlocked]);

  // Pulse the API status dot for ~1.5s after each received payload (cheap 500ms
  // poll of a ref, only while the server is listening).
  useEffect(() => {
    if (!apiListening) {
      setApiActive(false);
      return;
    }
    const id = window.setInterval(() => {
      setApiActive(performance.now() - apiLastDataRef.current < 1500);
    }, 500);
    return () => clearInterval(id);
  }, [apiListening]);

  // Keep the HUD camera label in sync with the selected camera device.
  useEffect(() => {
    const cam = cameras.find((c) => c.deviceId === cameraId);
    if (cam?.label) cameraLabelRef.current = cam.label;
  }, [cameraId, cameras]);

  // Start the sensor API server once the app is READY (if enabled in config).
  // Its own effect — NOT the camera-init IIFE — so StrictMode's mount→cleanup→
  // mount can't leave it stopped on a fresh launch (the inline call raced the
  // cleanup's stop). Keyed on `status` only, so it doesn't fire on config edits
  // (those still apply on SAVE, preserving the confirm-dialog behavior).
  useEffect(() => {
    if (status !== "ready") return;
    void applySensorServer(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // iOS suspends the process in the background, which stops the Sensor API accept
  // loop; when the app returns to the foreground, restart the server so it
  // resumes listening without a manual enable/disable toggle.
  useEffect(() => {
    if (status !== "ready" || !isIOS) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && config.sensorApiEnabled) {
        void applySensorServer(config);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, config.sensorApiEnabled, config.sensorApiPort, config.sensorApiBindHost, config.sensorApiToken]);

  // Poll the actual compositor render FPS while capturing (REC/LIVE badge).
  useEffect(() => {
    if (!rec.recording && streaming.state === "idle") return;
    const id = window.setInterval(() => {
      setRenderFps(compositorRef.current?.getFps() ?? 0);
      setRenderMs(compositorRef.current?.getDrawMs() ?? 0);
    }, 500);
    return () => clearInterval(id);
  }, [rec.recording, streaming.state]);

  // While capturing, cap the compositor to the capture rate so it doesn't spend
  // half the main thread on frames the recorder/stream never samples (that spare
  // budget is what stops the rAF stalls that froze the recording during a stream).
  useEffect(() => {
    const capturing = rec.recording || streaming.state !== "idle";
    const captureFps = streaming.state !== "idle" ? config.streamFps : 30;
    compositorRef.current?.setMaxFps(capturing ? captureFps : 60);
  }, [rec.recording, streaming.state, config.streamFps]);

  // Space toggles record/stop (ignored while typing or a modal is open).
  useEffect(() => {
    if (!unlocked || status !== "ready" || settingsOpen || libraryOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      // Space toggles LOCAL recording only; live is button-only (avoids an
      // accidental broadcast) and never mixes with a local take.
      if (destination !== "local" || streaming.live || rec.saving) return;
      if (rec.recording) void rec.stop();
      else void rec.start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, status, settingsOpen, libraryOpen, rec.recording, rec.saving, destination, streaming.live]);

  // Keys 1–4 switch to the 1st–4th camera in the device list (same order as the
  // camera dropdown). Ignored while typing or a modal is open. Works mid-recording
  // — onCameraChange runs the switch transition and keeps the take alive.
  useEffect(() => {
    if (!unlocked || status !== "ready" || settingsOpen || libraryOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const id = cameraDeviceIdForKey(e.code, cameras);
      if (!id) return; // not a 1–4 key, or no camera at that slot
      if (isEditableTarget(e.target)) return; // don't hijack typing
      e.preventDefault();
      void onCameraChange(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, status, settingsOpen, libraryOpen, cameras, cameraId]);

  function applyConfigToRefs(cfg: AppConfig) {
    personNameRef.current = cfg.personName;
    logNoRef.current = cfg.logNo;
    missionDayTextRef.current = cfg.missionDayText;
    outDirRef.current = cfg.outputDir;
    audioEnabledRef.current = cfg.audioEnabled;
    layoutIdRef.current = cfg.layoutId;
    themeIdRef.current = cfg.themeId;
    mirrorRef.current = cfg.mirror;
    crtRef.current = cfg.crtEffect;
    recordHeightRef.current = cfg.recordHeight;
    rtmpUrlRef.current = cfg.rtmpUrl;
    streamKeyRef.current = cfg.streamKey;
    saveLocalWhileLiveRef.current = cfg.saveLocalWhileLive;
    streamFpsRef.current = cfg.streamFps;
    streamBitrateKbpsRef.current = cfg.streamBitrateKbps;
    streamEncoderRef.current = cfg.streamEncoder;
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
      compositorRef.current.setResolution(recordHeightRef.current);
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
    // Layout & theme are HUD-look toggles: apply live (no Save needed) and
    // persist just this field over the last-saved config, so unsaved edits to
    // other fields in the panel aren't committed early.
    if (key === "layoutId" || key === "themeId") {
      if (key === "layoutId") layoutIdRef.current = value as string;
      else themeIdRef.current = value as string;
      registerHud();
      const persisted = { ...savedConfigRef.current, [key]: value };
      savedConfigRef.current = persisted;
      void saveConfig(persisted);
    }
  }

  async function browseFolder() {
    const dir = await openDialog({ directory: true });
    if (typeof dir === "string") setField("outputDir", dir);
  }

  async function applySettings() {
    await saveConfig(config);
    savedConfigRef.current = config;
    const audioWas = audioEnabledRef.current;
    applyConfigToRefs(config);
    compositorRef.current?.setMirror(config.mirror);
    compositorRef.current?.setCrt(config.crtEffect);
    // Resolution resizes the canvas backing store; skip mid-recording (it would
    // break the active capture stream). Ref is already updated for the next take.
    if (!rec.recording) compositorRef.current?.setResolution(config.recordHeight);
    rec.setDurationSec(config.durationMin * 60);
    dataSourceRef.current?.setCityOverride(config.cityOverride);
    vitalsSourceRef.current?.setEnabled(config.showVitals);
    registerHud(); // re-apply layout

    if (config.audioEnabled !== audioWas && !rec.recording) {
      if (config.audioEnabled) await startAudio(micId);
      else stopAudio();
    }
    void applySensorServer(config);
    setSettingsOpen(false);
  }

  // Regenerate the API token, persist it immediately (over the last-saved
  // config, like layout/theme), and restart the server so it takes effect now.
  function regenerateToken() {
    const token = generateToken();
    setConfig((cfg) => ({ ...cfg, sensorApiToken: token }));
    const persisted = { ...savedConfigRef.current, sensorApiToken: token };
    savedConfigRef.current = persisted;
    void saveConfig(persisted);
    if (persisted.sensorApiEnabled) void applySensorServer(persisted);
  }

  // Start/stop the sensor HTTP server to match the current config.
  async function applySensorServer(cfg: AppConfig) {
    try {
      if (cfg.sensorApiEnabled) {
        await invoke("start_sensor_server", {
          port: cfg.sensorApiPort,
          bindHost: cfg.sensorApiBindHost,
          token: cfg.sensorApiToken,
        });
        setApiListening(true);
      } else {
        sensorsRef.current = { items: [], at: 0 };
        sensorsRenderRef.current = [];
        seriesRef.current.clear();
        seriesRenderRef.current = [];
        captionRef.current = { text: "", at: 0, typing: true };
        await invoke("stop_sensor_server");
        setApiListening(false);
      }
    } catch (err) {
      // Surface bind failures (e.g. port in use) without breaking the app.
      setApiListening(false);
      console.error("sensor server:", err);
    }
  }

  if (!authReady) return <div className="stage" />;
  if (!unlocked) return <PinGate mode={pinMode} onUnlocked={() => setUnlocked(true)} />;

  return (
    <div className="stage">
      <div className="video-area">
        {/* 16:9 frame that matches the canvas's on-screen box, so the HTML top
            bar (brand + badge) stays aligned with the burned-in HUD brackets
            even when the window is letterboxed. */}
        <div className="frame">
        <canvas ref={canvasRef} className="preview-canvas" />

      <header className="topbar">
        <span className="brand">LAZY CAMERA HUD</span>
        {rec.recording ? (
          <span className="cap-badge recording">
            <span className="rec-dot" />
            {rec.mode === "fixed" ? "-" : ""}
            {fmtClock(rec.mode === "fixed" ? Math.max(0, rec.durationSec - rec.elapsedSec) : rec.elapsedSec)}
            <span className="live-spec">
              {` · ${config.recordHeight}p · ${renderFps} fps · ${renderMs}ms · ${config.streamEncoder === "software" ? "sw" : "hw"}`}
            </span>
            {apiInfo}
          </span>
        ) : streaming.state !== "idle" ? (
          <span className={`cap-badge live ${streaming.state}`}>
            <span className="rec-dot" />
            {liveLabel(streaming.state)}
            {streaming.state === "connecting" ? "" : ` ${fmtClock(streaming.elapsedSec)}`}
            <span className="live-spec">
              {/* Copy path streams the canvas resolution (no ffmpeg downscale); the
                  re-encode path uses the configured stream height (or 720 clamp). */}
              {` · ${streaming.clamped ? 720 : config.recordHeight}p${config.streamFps} · ${config.streamBitrateKbps}k${streaming.copyActive ? " · hw" : ""} · ${renderFps} fps · ${renderMs}ms`}
              {streaming.dropped > 0 ? ` · drop ${streaming.dropped}` : ""}
            </span>
            {apiInfo}
          </span>
        ) : destination === "live" ? (
          // LIVE tab selected (not yet broadcasting): show the live settings here,
          // compact, so they're easy to eyeball before going live.
          <span className="cap-badge live-ready">
            {`LIVE READY · ${config.recordHeight}p · ${config.streamFps}fps · ${config.streamBitrateKbps}k · ${config.streamEncoder === "software" ? "SW" : "HW"}`}
            {apiInfo}
          </span>
        ) : (
          capability && (
            <span className={`cap-badge ${capability.ok ? "ok" : "warn"}`}>
              {capability.ok
                ? `REC READY · ${config.recordHeight}p · ${recordCodecLabel} · ${config.streamEncoder === "software" ? "SW" : "HW"}`
                : "REC UNSUPPORTED"}
              {capability.ok && apiInfo}
            </span>
          )
        )}
      </header>
        </div>
      </div>

      {status === "ready" && (
        <div className="control-bar">
          <RecordingControls
            mode={destination === "live" ? streaming.mode : rec.mode}
            setMode={destination === "live" ? streaming.setMode : rec.setMode}
            durationSec={destination === "live" ? streaming.durationSec : rec.durationSec}
            setDurationSec={destination === "live" ? streaming.setDurationSec : rec.setDurationSec}
            recording={rec.recording}
            live={streaming.live}
            paused={rec.paused}
            savedFile={rec.savedFile ?? streaming.savedFile}
            saving={rec.saving || streaming.saving}
            transcodeProgress={rec.saving ? rec.transcodeProgress : streaming.transcodeProgress}
            error={rec.error ?? streaming.error}
            disabled={!capability?.ok}
            destination={destination}
            setDestination={(d) => {
              setDestination(d);
              streaming.reset(); // clear any stale LIVE ERROR / message when switching tabs
            }}
            streamConfigured={streamConfigured}
            onStart={rec.start}
            onStop={() => void rec.stop()}
            onPause={rec.pause}
            onResume={rec.resume}
            onGoLive={() => setConfirmLive(true)}
            onStopLive={() => void streaming.stop()}
            onOpenSettings={() => setSettingsOpen(true)}
          />

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
              title={rec.recording || streaming.live ? "Mic can't be changed while capturing" : "Microphone"}
              value={micId}
              disabled={rec.recording || streaming.live || !config.audioEnabled}
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
        </div>
      )}

      {libraryOpen && <LibraryView onClose={() => setLibraryOpen(false)} />}

      {settingsOpen && (
        <SettingsPanel
          config={config}
          setField={setField}
          layouts={listLayouts()}
          themes={listThemes()}
          onBrowse={() => void browseFolder()}
          onClose={() => setSettingsOpen(false)}
          onSave={() => void applySettings()}
          onRegenerateToken={regenerateToken}
        />
      )}

      {confirmLive && (
        <div className="settings-backdrop" onClick={() => setConfirmLive(false)}>
          <div className="settings-modal settings-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="settings-head">
              <span>GO LIVE?</span>
            </div>
            <p className="settings-confirm-body">
              Start broadcasting publicly to {liveHost(config.rtmpUrl)}?
              {config.saveLocalWhileLive ? " A local MP4 copy will be saved alongside." : ""}
            </p>
            <div className="settings-actions">
              <button className="settings-cancel" onClick={() => setConfirmLive(false)}>
                CANCEL
              </button>
              <button
                className="settings-save"
                onClick={() => {
                  setConfirmLive(false);
                  void streaming.start();
                }}
              >
                GO LIVE
              </button>
            </div>
          </div>
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

      {(rec.saving || streaming.saving) && (
        <div className="processing-overlay">
          <div className="processing-title">PROCESSING</div>
          <div className="processing-sub">
            {streaming.saving ? "SAVING LIVE COPY → MP4" : "TRANSCODING → MP4"}
          </div>
          <div className="processing-bar">
            <div
              className="processing-fill"
              style={{ width: `${Math.round((rec.saving ? rec.transcodeProgress : streaming.transcodeProgress) * 100)}%` }}
            />
          </div>
          <div className="processing-pct">
            {Math.round((rec.saving ? rec.transcodeProgress : streaming.transcodeProgress) * 100)}%
          </div>
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

// Compact display of a numeric series value (integers as-is, else 1 decimal).
function fmtSeriesValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// Short label for the LIVE badge per streaming state. No leading dot — the badge
// already renders the animated rec-dot circle.
function liveLabel(state: string): string {
  switch (state) {
    case "connecting":
      return "CONNECTING…";
    case "unstable":
      return "UNSTABLE";
    case "error":
      return "LIVE ERROR";
    default:
      return "LIVE";
  }
}

// Host shown in the Go-Live confirm dialog (best-effort parse of the RTMP URL).
function liveHost(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url || "your RTMP destination";
  }
}
