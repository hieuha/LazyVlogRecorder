# LazyCamHUD

> 🇻🇳 [Bản tiếng Việt](./README-vi.md)

_A daily video log — a face, a voice, a date — burned with a spacecraft HUD and transmitted from somewhere very far away._

## Log entry

Some days it feels like I'm out past the stars, drifting through an abandoned research station, while everyone I love stays back on Earth.

LazyCamHUD is how I record the transmission. Each clip is a daily log with a control‑panel HUD burned right into the frame — mission day, the weather where I am, a soundwave that moves when I speak. Low‑fidelity, a little delayed, imperfect. But real.

Someday, years from now, my daughter will open these and know exactly where I was — and that the whole time, I was thinking of her.

> The story behind it: [**Tôi đang mắc kẹt ở Sao Hỏa**](https://hatrunghieu.com/posts/lazycamhud-toi-dang-mac-ket-o-sao-hoa)

So — this is the tool that makes the log. Built with **Tauri 2 + React/TypeScript**.

**Version:** 0.6.5 · **Platform:** macOS (Windows coded but unverified · Linux deferred)

## Screenshots

| PIN lock | Recording |
| --- | --- |
| ![PIN lock](./docs/screenshot/1-lockscreen.webp) | ![Recording with burned‑in HUD](./docs/screenshot/2-video-recorder.webp) |
| **Processing → MP4** | **Log library** |
| ![Processing overlay](./docs/screenshot/3-processing-video.webp) | ![Log library](./docs/screenshot/4-logs-library.webp) |

![Sensor readouts + sparklines on the HUD](./docs/screenshot/5-sensor-series-chart.webp)

## What it does

- **Burned‑in HUD** — webcam + HUD on one `<canvas>`, recorded together (no separate overlay track).
- **Live data** — weather (humidity / rain / temp / condition) + location from Open‑Meteo + IP geo; city override.
- **Recording** — `FIXED` (auto‑stop) / `FREE` modes, pause/resume, mid‑take camera switch with a signal‑loss transition. Fixed **720p/1080p**. Records hardware **H.264 → remux to MP4** (near‑instant save); falls back to VP8 + transcode.
- **Go Live (RTMP/RTMPS)** — broadcast the burned‑in canvas + mic (YouTube/Facebook/Twitch) via bundled ffmpeg, with an optional **simultaneous local MP4** the network can't degrade. Tunable FPS/bitrate; stream res = record res; auto‑stops on a sustained slow network. Stream key stored locally, never logged.
- **Layouts / Themes** — data‑driven; `Martian`, `Minimal`, `Recon` × `Teal`, `Amber`, `Green`, `Crypt`. Add one = one file/entry.
- **Effects** — grid + CRT grain overlay, cinematic color grade, camera mirror.
- **Sensor API** — push your own readouts, sparklines, and captions onto the HUD over local HTTP ([below](#sensor-api)).
- **Ship Vitals** — opt‑in battery/CPU/RAM/uptime strip · **Library** — thumbnail grid, in‑app player, delete · **PIN lock** — 4‑digit gate.
- **Shortcuts** — `Space` start/stop recording · `1`–`4` switch camera.

## Quick start

```bash
npm install
./scripts/fetch-ffmpeg.sh          # Windows: scripts\fetch-ffmpeg.ps1
npm run tauri dev                  # or: npm run tauri build
```

`build` outputs to `src-tauri/target/release/bundle/` (`.app` + `.dmg` on macOS).

## Sensor API

Enable **Settings → API Service**, then push display text onto the HUD (burned into the video):

```bash
curl -X POST http://<host>:1337/sensors -H "Authorization: Bearer <token>" \
  -d '{"items":[{"label":"CO2","value":"812","unit":"ppm"}]}'
```

- `POST /sensors` readouts · `POST /series` sparkline point · `POST /text` typewriter caption · `GET /healthz` liveness.
- Token + port + LAN toggle in Settings (LAN binds `0.0.0.0` and **requires** a token). Limits: ≤6 items, body ≤8 KB, display text only.
- Try it: `node scripts/mock-sonde.mjs <token>`. Full reference: **[docs/sensor-api.md](./docs/sensor-api.md)**.

## Storage & security (macOS)

Under `com.hatrunghieu.lazycamhud`: config/entries/PIN in Application Support, thumbnails in Caches, videos in `~/Movies/LazyCamHUD/` (or your chosen folder). The PIN is a **UX lock, not encryption** — recordings are stored **unencrypted**.

## Docs

[Project overview](./docs/project-overview.md) · [Architecture](./docs/system-architecture.md) · [Codebase](./docs/codebase-summary.md) · [Usage](./docs/usage-guide.md) · [Sensor API](./docs/sensor-api.md) · [Deployment](./docs/deployment-guide.md) · [Tiếng Việt](./docs/vi/)

## Tech stack

Tauri 2 (Rust) · React 19 + TypeScript + Vite · Canvas2D HUD · Web Audio · Open‑Meteo · bundled ffmpeg.
