# LazyCamHUD

> 🇻🇳 [Bản tiếng Việt](./README-vi.md)

**LazyCamHUD** (display name: *Lazy Camera HUD*) is a desktop webcam vlog recorder that burns a sci‑fi *The Martian*–style HUD directly into the video — mission day, live weather gauges, location, a real‑time mic soundwave and a CRT overlay. Built with **Tauri 2 + React/TypeScript**.

**Version:** 0.4.0 · **Platforms:** macOS + Windows (Linux deferred)

## Screenshots

| PIN lock | Recording |
| --- | --- |
| ![PIN lock screen](./docs/screenshot/1-lockscreen.webp) | ![Recording with burned‑in HUD](./docs/screenshot/2-video-recorder.webp) |
| **Processing → MP4** | **Log library** |
| ![Transcode progress overlay](./docs/screenshot/3-processing-video.webp) | ![Log library grid](./docs/screenshot/4-logs-library.webp) |

Sensor API — external readouts + live sparkline charts pushed over HTTP:

![Sensor readouts and sparkline charts on the HUD](./docs/screenshot/5-sensor-series-chart.webp)

## Features

- **Burned‑in HUD** — webcam + HUD composited on one `<canvas>` and recorded together (nothing is a separate overlay track).
- **Live data HUD** — humidity, rain probability, temperature, weather condition, and location from Open‑Meteo + IP geolocation; city can be overridden (forward‑geocoded so weather follows the place).
- **Recording modes** — `FIXED` (countdown auto‑stop) and `FREE` (manual stop); pause/resume; camera switching mid‑recording keeps the take alive with a static + collapse transition.
- **MP4 export** — records VP8/WebM at a fixed **720p or 1080p** (16:9), then transcodes to MP4 (H.264/AAC, CRF‑26, faststart) via a bundled static ffmpeg; streams to a temp file (flat memory) with a live progress overlay.
- **Layouts** — data‑driven registry; ships `Martian` and `Minimal` (add a layout = one file).
- **Effects** — CRT grain overlay, cinematic color grade, camera mirror — all toggleable.
- **PIN lock** — 4‑digit gate on launch, change‑PIN flow, and a lock button.
- **Library** — every recording is indexed with a thumbnail; grid view, in‑app player, reveal‑in‑folder, delete.
- **Persistent settings** — name, log number (auto‑increment), output folder, duration, resolution (720p/1080p), layout, audio, mirror, CRT, city.

## Quick start (dev)

```bash
npm install
./scripts/fetch-ffmpeg.sh   # macOS: fetch the bundled ffmpeg for your arch
npm run tauri dev
```

On **Windows**, fetch ffmpeg with the PowerShell script instead:

```powershell
npm install
powershell -ExecutionPolicy Bypass -File scripts\fetch-ffmpeg.ps1
npm run tauri dev
```

> Linux is deferred — WebKitGTK's `MediaRecorder`/`captureStream` support is inconsistent, so recording is unreliable there.

## Build

```bash
npm run tauri build
```

Outputs to `src-tauri/target/release/bundle/` (`.app` + `.dmg` on macOS). See [docs/deployment-guide.md](./docs/deployment-guide.md).

## Sensor API

Enable **Settings → Sensor API** to push your own sensor readings onto the right side of the HUD (burned into the video). The app runs a small HTTP endpoint:

```bash
curl -X POST http://<host>:1337/sensors \
  -H "Authorization: Bearer <token>" \
  -d '{"items":[{"label":"CO2","value":"812","unit":"ppm"},{"label":"HR","value":"78","unit":"bpm"}]}'
```

- Response: `200 {"ok":true,"count":N}` on success; `401` bad token, `400` bad JSON, `413` too large (each with a JSON `error`). Add `-i` to `curl` to see the status.
- Port, LAN access, and the bearer token are all configurable in Settings.
- LAN mode binds `0.0.0.0` and **requires** the token; otherwise it binds `127.0.0.1`.
- Limits: ≤ 6 items; `label`/`value`/`unit` truncated to 12/10/6 chars; body ≤ 8 KB.
- Rows dim after ~10 s without an update. Only display text is accepted — nothing is executed.
- `GET /healthz` (no token) → `{"ok":true,...}` for a reachability/liveness check.

### Time series (sparklines)

`POST /series` with a single numeric point per call; the app buffers the last ~120 points per `label` and draws a mini line chart (auto-scaled, x = time, y = value):

```bash
curl -X POST http://<host>:1337/series \
  -H "Authorization: Bearer <token>" \
  -d '{"label":"ALT","value":12345,"unit":"m"}'
```

### Caption (typewriter)

`POST /text` shows a free-text line near the bottom, revealed with a typewriter effect:

```bash
curl -X POST http://<host>:1337/text \
  -H "Authorization: Bearer <token>" \
  -d '{"text":"RS41 · Y0532363"}'
```

### Try it with the bundled mock

Simulates a weather-balloon flight (lat/lon, altitude sparkline, distance, battery, name caption):

```bash
node scripts/mock-sonde.mjs <token>   # synthetic flight
# replay the bundled real RS41 log:
node scripts/replay-sonde-log.mjs scripts/20260708-115249_Y0532363_RS41_403000_sonde.log <token>
```

Full reference: **[docs/sensor-api.md](./docs/sensor-api.md)**.

## Where things are stored (macOS)

Under the bundle identifier `com.hatrunghieu.lazycamhud`:

- `~/Library/Application Support/com.hatrunghieu.lazycamhud/` — `config.json`, `entries.json`, `auth.json` (PIN)
- `~/Library/Caches/com.hatrunghieu.lazycamhud/thumbs/` — thumbnails
- `~/Movies/LazyCamHUD/` — recorded videos (or your chosen output folder)

## Security note

The PIN is a **UX lock**, not encryption — recordings are stored **unencrypted** on disk. Anyone with disk access can read them.

## Documentation

- [Project overview](./docs/project-overview.md)
- [System architecture](./docs/system-architecture.md)
- [Codebase summary](./docs/codebase-summary.md)
- [Usage guide](./docs/usage-guide.md)
- [Sensor API](./docs/sensor-api.md)
- [Deployment guide](./docs/deployment-guide.md)
- Tiếng Việt: [docs/vi/](./docs/vi/)

## Tech stack

Tauri 2 (Rust) · React 19 + TypeScript + Vite · Canvas2D HUD · Web Audio · Open‑Meteo · bundled ffmpeg.
