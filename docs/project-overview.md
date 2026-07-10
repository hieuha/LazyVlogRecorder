# Project Overview — LazyCamHUD

**LazyCamHUD** is a cross‑platform desktop app that records webcam "log entry" vlogs with a *The Martian*–style HUD **burned into the video**. Gauges show real weather for your location; the whole frame (webcam + HUD + effects) is composited on a single canvas and recorded together, so the exported MP4 already contains the HUD.

- **Display name:** Lazy Camera HUD
- **Bundle id:** `com.hatrunghieu.lazycamhud`
- **Version:** 0.6.1
- **Targets:** macOS + Windows (Linux deferred)
- **Stack:** Tauri 2 (Rust) + React 19 + TypeScript + Vite

## Goals

- Make a "hit record and talk" vlog tool with a cinematic sci‑fi overlay that is part of the footage.
- Real, useful data on the HUD (weather/location), not just decorative numbers.
- Fixed‑duration recordings (e.g. 15 min) or free recording, with a simple, good‑looking UI.

## Core capabilities

| Area | What it does |
|------|--------------|
| Recording | FIXED (auto‑stop) / FREE modes, pause/resume, mid‑recording camera switch with a static/collapse transition |
| Export | VP8/WebM (720p or 1080p, 16:9) → MP4 (H.264/AAC, CRF‑26, faststart) via bundled ffmpeg; streamed to temp file; progress overlay |
| HUD | Data‑driven layout registry (Martian, Minimal, Recon) + swappable themes (Teal, Amber, Green, Crypt); gauges (humidity, rain, temp), environment, location, SOL date, clock, log entry, live mic soundwave; opt‑in Ship Vitals strip (battery, CPU, RAM, uptime) |
| Effects | CRT grain, color grade, mirror — toggleable |
| Data | IP geolocation + Open‑Meteo weather; city override is forward‑geocoded |
| Sensor API | Local HTTP endpoint (`/sensors`, `/series`, `/text`) pushes custom readouts, sparkline charts, and a typewriter caption onto the HUD; token + LAN bind; weather‑balloon simulators bundled |
| Auth | 4‑digit PIN gate, change PIN, lock button |
| Library | Indexed recordings with thumbnails; grid, in‑app player, reveal, delete |
| Settings | Persisted via Tauri Store (name, log #, folder, duration, resolution, layout, theme, audio, mirror, CRT, city, Ship Vitals toggle) |

## Non‑goals (current)

- No cloud upload, editing/trimming, or multi‑camera compositing.
- No at‑rest encryption — the PIN is a UX lock only.
- No iOS/iPad build (blocked by iOS forbidding subprocess spawn for ffmpeg).

## Key decisions

- **Single‑canvas HUD** so `canvas.captureStream()` + `MediaRecorder` record webcam + HUD burned in together.
- **Bundled ffmpeg run as a child process** (path self‑resolved for dev vs bundle) rather than a webview codec, for reliable MP4.
- **Separate mic (audio) and camera (video) streams** so switching camera mid‑recording keeps audio continuous.

See [system-architecture.md](./system-architecture.md) and [codebase-summary.md](./codebase-summary.md).
