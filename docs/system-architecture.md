# System Architecture — LazyCamHUD

## High level

```
┌────────────────── Frontend (React + TS + Vite) ─────────────────┐
│ PIN gate ──► App                                                │
│   getUserMedia(video) + getUserMedia(audio)  [separate streams] │
│        │ video                                                  │
│        ▼                                                        │
│   CanvasCompositor (rAF loop, one <canvas>)                     │
│     ├─ draw webcam frame (cover, optional mirror)               │
│     ├─ HUD layer  = layout-engine(layout, state)                │
│     └─ CRT overlay + switch transition                          │
│        │ canvas.captureStream(30).videoTrack                    │
│        │ + mic audioTrack ─► MediaRecorder (WebM, chunked)      │
│        ▼ append each chunk                                      │
│   temp file  ─────────────invoke──────────────►                 │
└────────┼────────────────────────────────────────────────────────┘
         ▼
┌────────────────── Backend (Rust / Tauri commands) ─────────────┐
│ ffmpeg (bundled): temp WebM ─► MP4 (H.264/AAC, faststart)      │
│   emits transcode-progress events                              │
│ recording_fs: start/append/move temp, delete, save            │
│ geo/weather proxies (no CORS, keyless); geocode city          │
│ auth: PIN hash (SHA-256 + salt) in auth.json                  │
│ ffmpeg thumbnail; asset protocol for local playback           │
└────────────────────────────────────────────────────────────────┘
```

## Invariants

- **HUD lives on the canvas, not the DOM.** MediaRecorder can only record a `<canvas>`/stream, so webcam + HUD are composited on one canvas; that same canvas is both the preview and the `captureStream()` source → the HUD is burned in.
- **Layout is data‑driven.** A layout is a declarative list of widget specs (`{type, anchor, offset, …}`). The engine resolves anchors → canvas points and dispatches to widget draw functions. Adding a layout is one file + one registry entry.
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

## Auth

- `set_pin` / `verify_pin` / `change_pin`: salted SHA‑256 stored in `auth.json` (app config dir). This is a **UX lock**, not encryption. On lock, the camera/streams are released and the app returns to the PIN screen; the compositor is nulled so it rebinds the freshly‑mounted canvas on re‑unlock.

## ffmpeg bundling

Bundled as a static binary (per target triple) under `src-tauri/binaries/` (git‑ignored, fetched by `scripts/fetch-ffmpeg.sh`). Resolved at runtime from the executable directory (bundle) or `CARGO_MANIFEST_DIR/binaries` (dev). iOS is blocked because it forbids spawning subprocesses.
