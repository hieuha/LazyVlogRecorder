# System Architecture — LazyCamHUD

## High level

```
┌────────────────── Frontend (React + TS + Vite) ─────────────────┐
│ PIN gate ──► App                                                │
│   getUserMedia(video) + getUserMedia(audio)  [separate streams] │
│        │ video                                                  │
│        ▼                                                        │
│   CanvasCompositor (rAF ~60fps, one 16:9 <canvas>, 720p/1080p)  │
│     ├─ draw webcam frame (cover, optional mirror)               │
│     ├─ HUD layer  = layout-engine(layout, state)                │
│     └─ CRT overlay + switch transition                          │
│        │ canvas.captureStream(30).videoTrack                    │
│        │ + mic audioTrack ─► MediaRecorder (VP8/WebM, chunked)  │
│        ▼ append each chunk                                      │
│   temp file  ─────────────invoke──────────────►                 │
│   sensor events (sensors/series/text) ◄── Tauri events ──┐      │
└────────┼─────────────────────────────────────────────────┼──────┘
         ▼                                                  │
┌────────────────── Backend (Rust / Tauri commands) ───────┼─────┐
│ ffmpeg (bundled): temp WebM ─► MP4 (H.264/AAC CRF‑26)     │     │
│   emits transcode-progress events                        │     │
│ recording_fs: start/append/move temp, delete, save       │     │
│ geo/weather proxies (no CORS, keyless); geocode city     │     │
│ auth: PIN hash (SHA-256 + salt) in auth.json             │     │
│ sensor_server (tiny_http): /sensors /series /text ───────┘     │
│ ffmpeg thumbnail; asset protocol for local playback           │
└────────────────────────────────────────────────────────────────┘
```

## Invariants

- **HUD lives on the canvas, not the DOM.** MediaRecorder can only record a `<canvas>`/stream, so webcam + HUD are composited on one canvas; that same canvas is both the preview and the `captureStream()` source → the HUD is burned in.
- **Layout is data‑driven.** A layout is a declarative list of widget specs (`{type, anchor, offset, …}`). The engine resolves anchors → canvas points and dispatches to widget draw functions. Adding a layout is one file + one registry entry.
- **Theme is decoupled from layout.** A theme is just a palette (`HudTheme`) in its own registry; the selected theme is applied over whichever layout is active (`createHudLayer(layout, getState, themeOverride)`), so any theme works with any layout. Layout and theme both apply live from Settings (no Save) and persist immediately.
- **Audio and video streams are separate.** Switching the camera swaps only the video stream; the mic track held by MediaRecorder stays live, so recording continues (a static + collapse‑to‑center transition covers the gap).
- **Flat memory recording.** MediaRecorder chunks (1s) stream to a temp file via `append_temp_chunk`; the whole clip is never held in RAM, and bytes cross IPC as raw `ArrayBuffer` (never `Array.from`).

## Recording → export pipeline

1. `start_temp_recording(ext)` → temp path.
2. `MediaRecorder` chunks → `append_temp_chunk(path, bytes)`.
3. On stop: `transcode_to_mp4(temp, name, outDir, durationSec)` runs bundled ffmpeg on a blocking thread with `-progress pipe:1`, emitting `transcode-progress` (0..1).
4. Success → temp removed, MP4 in output folder. Failure → `move_temp` keeps the raw WebM (never lose a take).
5. Entry indexed (`entries.json`) + thumbnail generated (`generate_thumbnail`).

## Data layer

- `geo_locate` (ip‑api.com) → coordinates + city.
- `get_weather` (Open‑Meteo) → temperature, humidity, current‑hour precipitation probability, weather code.
- `geocode_city` (Open‑Meteo geocoding) → coordinates for a city override so weather follows the chosen place.
- Refreshes every ~10 min; caches last‑good; offline first‑launch shows `UNKNOWN` / `--`.

## Recording resolution & codec

- The canvas backing store is a **fixed 16:9 frame** (720p or 1080p from settings), not the window size — so output is deterministic and reasonably sized. The preview letterboxes to fit.
- `MediaRecorder` prefers **VP8** over VP9 (no hardware VP9 encoder on macOS; VP8 is far lighter for real‑time), then transcodes to **H.264 CRF‑26 (preset medium)** for small MP4s.
- The compositor draw loop is capped at ~60fps so ProMotion 120Hz displays don't render the HUD twice per captured frame.

## Sensor API

- `sensor_server.rs` runs a small `tiny_http` server (background thread) started/stopped by `App` from settings. Bind is `127.0.0.1` or `0.0.0.0` (LAN); a bearer token is required in LAN mode.
- `POST /sensors` (scalar readouts), `POST /series` (numeric points → sparkline buffer), `POST /text` (typewriter caption). Each validated + clamped, then forwarded to the frontend via Tauri events (`sensors`/`series`/`text`).
- The frontend injects these into `HudState` each frame, so they render as HUD widgets and are **burned into the recording** like everything else.

## Auth

- `set_pin` / `verify_pin` / `change_pin`: salted SHA‑256 stored in `auth.json` (app config dir). This is a **UX lock**, not encryption. On lock, the camera/streams are released and the app returns to the PIN screen; the compositor is nulled so it rebinds the freshly‑mounted canvas on re‑unlock.

## ffmpeg bundling

Bundled as a static binary (per target triple) under `src-tauri/binaries/` (git‑ignored, fetched by `scripts/fetch-ffmpeg.sh` on macOS or `scripts/fetch-ffmpeg.ps1` on Windows). Resolved at runtime from the executable directory (bundle) or `CARGO_MANIFEST_DIR/binaries` (dev), with the `.exe` suffix on Windows. iOS is blocked because it forbids spawning subprocesses.
