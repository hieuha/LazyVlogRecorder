# Project Overview — LazyCamHUD

**LazyCamHUD** is an Apple-native app (macOS + iOS/iPadOS) that records "log entry" vlogs with a *The Martian*–style HUD **burned into the video**. Gauges show real weather for your location; the whole frame (webcam + HUD + effects) is composited on a single canvas and recorded together, so the exported MP4 already contains the HUD.

- **Display name:** Lazy Camera HUD
- **Bundle id:** `com.hatrunghieu.lazycamhud`
- **Version:** 0.6.5
- **Platforms:** macOS (arm64 + x86_64) + iOS/iPadOS (universal iPhone & iPad, 16.4+)
- **Stack:** Tauri 2 (Rust) + React 19 + TypeScript + Vite + WebKit

## Goals

- Make a "hit record and talk" vlog tool with a cinematic sci‑fi overlay that is part of the footage.
- Real, useful data on the HUD (weather/location), not just decorative numbers.
- Fixed‑duration recordings (e.g. 15 min) or free recording, with a simple, good‑looking UI.

## Core capabilities

| Area | What it does |
|------|--------------|
| Recording | FIXED (auto‑stop) / FREE modes, pause/resume, mid‑recording camera switch via **1–4 hotkeys** (macOS) or dropdown with a static/collapse transition; fixed 720p or 1080p 16:9. **macOS:** hardware H.264 or VP8/WebM fallback → fast MP4 remux. **iOS:** native H.264/AAC subprocess-free MP4. Screen stays awake during capture (WKWebView Screen Wake Lock, iOS 16.4+). |
| Export | Fast MP4 remux (H.264/AAC) with faststart enabled on both platforms (no ffmpeg subprocess on iOS). |
| HUD | Data‑driven layout registry (Martian, Minimal, Recon) + swappable themes (Teal, Amber, Green, Crypt); gauges (humidity with unit ring on shared baseline, rain, temp), environment, location, SOL date, clock, log entry, live mic soundwave; full‑frame grid mesh overlay; opt‑in Ship Vitals strip (battery, CPU, RAM, uptime; battery iOS-only) |
| Effects | CRT grain, color grade, mirror, grid overlay — toggleable |
| Data | IP geolocation + Open‑Meteo weather; city override is forward‑geocoded |
| Sensor API | Local HTTP endpoint (`/sensors`, `/series`, `/text`) pushes custom readouts, sparkline charts, and a typewriter caption onto the HUD; bind-host dropdown (localhost / LAN IPs); token required for non-loopback access. On-screen API status (host:port + pulsing dot, never burned into recording). **iOS:** foreground-only; auto-resumes when app returns to foreground. **macOS:** always-on. NSLocalNetworkUsageDescription prompt on iOS when accessing LAN. |
| Auth | 4‑digit PIN gate, change PIN, lock button. Stored in OS Keychain (salt + SHA-256 hash on both platforms). |
| Library | Indexed recordings with thumbnails; grid, in‑app player, reveal, delete |
| Settings | Persisted via Tauri Store (name, log #, folder, duration, resolution, layout, theme, audio, mirror, CRT, city, Ship Vitals toggle, Sensor API bind host/port/token) |
| Go Live (RTMP) | **macOS only**: broadcast canvas + mic via bundled ffmpeg with optional simultaneous local MP4 backup. Hidden on iOS. |

## Non‑goals (current)

- No cloud upload, editing/trimming, or multi‑camera compositing.
- PIN is a UX lock only; at-rest encryption via iOS Data Protection (device passcode required).
- No RTMP streaming on iOS (future work via HaishinKit or similar).
- No Photos or Files app export (future work).

## Key decisions

- **Single‑canvas HUD** so `canvas.captureStream()` + MediaRecorder record webcam + HUD burned in together.
- **No subprocess on iOS** — native H.264/AAC recording via WebKit MediaRecorder (iOS 16.4+). **macOS:** bundled ffmpeg (path self‑resolved for dev vs bundle) is used for RTMP streaming only; local recording is also native.
- **Separate mic (audio) and camera (video) streams** so switching camera mid‑recording keeps audio continuous.
- **Sensor API foreground-only on iOS** to avoid draining battery; auto-resumes when app returns to foreground.
- **Bind-host dropdown** (127.0.0.1 / 0.0.0.0 / LAN IPs) replaces old boolean toggle, making explicit which interfaces expose the API and requiring token for non-loopback.

See [system-architecture.md](./system-architecture.md) and [codebase-summary.md](./codebase-summary.md).
