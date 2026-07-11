# LazyCamHUD

> 🇻🇳 [Bản tiếng Việt](./README-vi.md)

_A daily video log — a face, a voice, a date — burned with a spacecraft HUD and transmitted from somewhere very far away._

## Log entry

Some days it feels like I'm out past the stars, drifting through an abandoned research station, while everyone I love stays back on Earth.

LazyCamHUD is how I record the transmission. Each clip is a daily log with a control‑panel HUD burned right into the frame — mission day, the weather where I am, a soundwave that moves when I speak. Low‑fidelity, a little delayed, imperfect. But real.

Someday, years from now, my daughter will open these and know exactly where I was — and that the whole time, I was thinking of her.

> The story behind it: [**Tôi đang mắc kẹt ở Sao Hỏa**](https://hatrunghieu.com/posts/lazycamhud-toi-dang-mac-ket-o-sao-hoa)

So — this is the tool that makes the log. Built with **Tauri 2 + React/TypeScript**.

**Version:** 0.6.5 · **Platform:** macOS + iOS/iPadOS (Apple only)

## Screenshots

| PIN lock | Recording |
| --- | --- |
| ![PIN lock](./docs/screenshot/1-lockscreen.webp) | ![Recording with burned‑in HUD](./docs/screenshot/2-video-recorder.webp) |
| **Processing → MP4** | **Log library** |
| ![Processing overlay](./docs/screenshot/3-processing-video.webp) | ![Log library](./docs/screenshot/4-logs-library.webp) |

![Sensor readouts + sparklines on the HUD](./docs/screenshot/5-sensor-series-chart.webp)

## What it does

- **Burned‑in HUD** — camera + HUD on one `<canvas>`, recorded together (no separate overlay track).
- **Live data** — weather (humidity / rain / temp / condition) + location from Open‑Meteo + IP geo; city override.
- **Recording** — `FIXED` (auto‑stop) / `FREE` modes, pause/resume, mid‑take camera switch with a signal‑loss transition. Fixed **720p/1080p**. Records hardware **H.264/AAC MP4 directly**; no subprocess, no transcode (iOS/macOS unified, subprocess-free). VP8 fallback on desktop edge cases only. Screen stays awake during capture (WKWebView Screen Wake Lock, iOS 16.4+ / macOS).
- **Go Live (RTMP/RTMPS)** — **macOS only** — broadcast the burned‑in canvas + mic (YouTube/Facebook/Twitch) via bundled ffmpeg, with an optional **simultaneous local MP4** the network can't degrade. Tunable FPS/bitrate; stream res = record res; auto‑stops on a sustained slow network. Stream key stored locally, never logged. Hidden on iOS.
- **Layouts / Themes** — data‑driven; `Martian`, `Minimal`, `Recon` × `Teal`, `Amber`, `Green`, `Crypt`. Add one = one file/entry.
- **Effects** — grid + CRT grain overlay, cinematic color grade, camera mirror.
- **Sensor API** — push your own readouts, sparklines, and captions onto the HUD over local HTTP; bind-host dropdown (localhost / LAN / custom); token required for network access; on-screen API status indicator ([below](#sensor-api)).
- **Ship Vitals** — opt‑in CPU/RAM/uptime (iOS + macOS) + battery (macOS only) · **Library** — thumbnail grid, in‑app player, delete · **PIN lock** — 4‑digit gate (macOS + iOS, stored in OS Keychain).
- **Shortcuts** — `Space` start/stop recording · `1`–`4` switch camera.

## Quick start

**macOS:**
```bash
npm install
./scripts/fetch-ffmpeg.sh
npm run tauri dev                  # or: npm run tauri build
```
Outputs to `src-tauri/target/release/bundle/` (`.app` + `.dmg`).

**iOS/iPadOS:**
```bash
npm install
npm run tauri ios init             # one-time: generate Xcode project into src-tauri/gen/apple
npm run tauri ios dev              # or: npm run tauri ios build
```
Requires Xcode, CocoaPods, rust iOS targets (`aarch64-apple-ios`, `aarch64-apple-ios-sim`), and the iOS platform runtime.
Outputs to `src-tauri/gen/apple/build/` (`.ipa` or Xcode build folder for TestFlight/App Store).

## Sensor API

Enable **Settings → API Service**, then push display text onto the HUD (burned into the video):

```bash
curl -X POST http://<host>:1337/sensors -H "Authorization: Bearer <token>" \
  -d '{"items":[{"label":"CO2","value":"812","unit":"ppm"}]}'
```

- `POST /sensors` readouts · `POST /series` sparkline point · `POST /text` typewriter caption · `GET /healthz` liveness.
- Settings: bind-host dropdown (localhost / LAN IPs / custom), port, token. Network host **requires** token. On iOS, runs foreground-only and auto-resumes when app returns to foreground. Limits: ≤6 items, body ≤8 KB, display text only.
- On-screen indicator shows host:port + status dot (never burned into the recording).
- Try it: `node scripts/mock-sonde.mjs <token>`. Full reference: **[docs/sensor-api.md](./docs/sensor-api.md)**.

## Storage & security

**macOS:** config/entries/PIN in Application Support, thumbnails in Caches, videos in `~/Movies/LazyCamHUD/` (or your chosen folder). Recordings are stored unencrypted; PIN is a **UX lock, not encryption**.

**iOS:** config/entries/videos/thumbnails in the app's Documents sandbox. PIN stored in OS Keychain (salt + SHA-256). Recordings encrypted at rest via NSFileProtectionComplete: when the device has a passcode, files are inaccessible while the device is locked.

**Both platforms:** No ffmpeg subprocess; H.264/AAC MP4 recording is unified and native. On iOS, at-rest encryption is hardware-backed and independent of the app PIN.

## Docs

[Project overview](./docs/project-overview.md) · [Architecture](./docs/system-architecture.md) · [Codebase](./docs/codebase-summary.md) · [Usage](./docs/usage-guide.md) · [Sensor API](./docs/sensor-api.md) · [Deployment](./docs/deployment-guide.md) · [Tiếng Việt](./docs/vi/)

## Tech stack

Tauri 2 (Rust) · React 19 + TypeScript + Vite · WebKit (WKWebView) · Canvas2D HUD · Web Audio · Open‑Meteo · OS Keychain (PIN) · bundled ffmpeg (macOS only).
