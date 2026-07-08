# LazyCamHUD

> 🇻🇳 [Bản tiếng Việt](./README-vi.md)

**LazyCamHUD** (display name: *Lazy Camera HUD*) is a desktop webcam vlog recorder that burns a sci‑fi *The Martian*–style HUD directly into the video — mission day, live weather gauges, location, a real‑time mic soundwave and a CRT overlay. Built with **Tauri 2 + React/TypeScript**.

**Version:** 0.1.0 · **Platforms:** macOS + Windows (Linux deferred)

## Features

- **Burned‑in HUD** — webcam + HUD composited on one `<canvas>` and recorded together (nothing is a separate overlay track).
- **Live data HUD** — humidity, rain probability, temperature, weather condition, and location from Open‑Meteo + IP geolocation; city can be overridden (forward‑geocoded so weather follows the place).
- **Recording modes** — `FIXED` (countdown auto‑stop) and `FREE` (manual stop); pause/resume; camera switching mid‑recording keeps the take alive with a static + collapse transition.
- **MP4 export** — WebM → MP4 (H.264/AAC, faststart) via a bundled static ffmpeg; recording streams to a temp file (flat memory) with a live progress overlay.
- **Layouts** — data‑driven registry; ships `Martian` and `Minimal` (add a layout = one file).
- **Effects** — CRT grain overlay, cinematic color grade, camera mirror — all toggleable.
- **PIN lock** — 4‑digit gate on launch, change‑PIN flow, and a lock button.
- **Library** — every recording is indexed with a thumbnail; grid view, in‑app player, reveal‑in‑folder, delete.
- **Persistent settings** — name, log number (auto‑increment), output folder, duration, layout, audio, mirror, CRT, city.

## Quick start (dev)

```bash
npm install
./scripts/fetch-ffmpeg.sh   # fetch the bundled ffmpeg for your OS/arch
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

Outputs to `src-tauri/target/release/bundle/` (`.app` + `.dmg` on macOS). See [docs/deployment-guide.md](./docs/deployment-guide.md).

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
- [Deployment guide](./docs/deployment-guide.md)
- Tiếng Việt: [docs/vi/](./docs/vi/)

## Tech stack

Tauri 2 (Rust) · React 19 + TypeScript + Vite · Canvas2D HUD · Web Audio · Open‑Meteo · bundled ffmpeg.
