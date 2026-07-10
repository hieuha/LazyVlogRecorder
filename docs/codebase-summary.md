# Codebase Summary — LazyCamHUD

## Frontend (`src/`)

| Path | Responsibility |
|------|----------------|
| `App.tsx` | Orchestrator: auth gate, camera/mic init, compositor + HUD wiring, controls, settings/library, Space hotkey; starts/stops the sensor server and feeds `sensors`/`series`/`text` events into the HUD |
| `compositor/canvas-compositor.ts` | Single‑canvas rAF loop (capped ~60fps): draws webcam (cover, mirror), runs HUD layers, CRT overlay, camera‑switch static/collapse transition; fixed 16:9 backing store via `setResolution` (720p/1080p); `captureStream` source |
| `compositor/media-devices.ts` | Permissions, device enumeration, `openVideoStream` / `openAudioStream` (kept separate) |
| `hud/layout-engine.ts` | Resolves widget anchors → canvas points (incl. top/bottom‑center), dispatches to widgets |
| `hud/layouts/*.layout.ts` | Declarative layouts (`martian`, `minimal`, `recon`) + `layout-registry.ts` |
| `hud/theme.ts` · `hud/theme-registry.ts` | HUD palettes (`martianTheme` teal, `marsAmberTheme`, `greenHackerTheme`) + selectable-theme registry; a theme restyles any layout |
| `hud/widgets/*` | Canvas2D widgets: gauge‑arc, readouts (clock, mission‑day, location, environment, log‑entry), soundwave, frame/scanline/color‑grade, CRT (`signal-noise`), text primitives, and the sensor API widgets (`sensor-panel`, `series-panel` sparklines, `caption` typewriter + idle hex) |
| `hud/audio-analyser.ts` | Web Audio analyser → rolling amplitude for the soundwave |
| `data/*` | `geolocation-client`, `weather-client`, `metric-mapping`, `hud-data-source` (fetch + cache + geocode override) |
| `recording/*` | `recorder` (MediaRecorder + chunk streaming), `use-recorder` (modes, timer, pause/resume, transcode + progress), `recording-controls`, `save-client`, `output-naming` |
| `settings/*` | `config-store` (Tauri Store; incl. record resolution + sensor API port/LAN/token), `settings-panel` |
| `auth/*` | `pin-gate`, `pin-pad`, `change-pin-flow`, `auth-client` |
| `library/*` | `entries-store`, `library-client`, `library-view` (grid, player, delete) |
| `components/hud-select.tsx` | Custom themed dropdown (replaces native `<select>`) |

## Backend (`src-tauri/`)

| Path | Responsibility |
|------|----------------|
| `src/lib.rs` | Registers plugins (opener, store, dialog) + all commands |
| `src/commands/auth.rs` | `has_pin` / `set_pin` / `verify_pin` / `change_pin` |
| `src/commands/geo.rs` | `geo_locate` (IP), `geocode_city` (Open‑Meteo geocoding) |
| `src/commands/weather.rs` | `get_weather` (Open‑Meteo current + hourly precip probability) |
| `src/commands/recording_fs.rs` | `start_temp_recording`, `append_temp_chunk`, `move_temp`, `delete_files`, `resolve_out_dir` |
| `src/commands/ffmpeg.rs` | `transcode_to_mp4` (H.264 CRF‑26, progress events), `generate_thumbnail`; self‑resolves the ffmpeg path (`.exe` on Windows) |
| `src/commands/sensor_server.rs` | `start_sensor_server` / `stop_sensor_server`: tiny_http server for `POST /sensors` (readouts), `/series` (sparklines), `/text` (caption); bearer token, localhost/LAN bind, emits events to the HUD |
| `tauri.conf.json` | productName, window, bundle (icons, ffmpeg `externalBin`, entitlements), asset protocol |
| `binaries/` | Bundled ffmpeg per target (git‑ignored, via `scripts/fetch-ffmpeg.sh`) |

## Conventions

- Kebab‑case files for TS; snake_case for Rust; modules kept small and single‑purpose.
- HUD widgets are pure draw functions `(ctx, rect/props, theme, state)`.
- Persistent state lives in Tauri Store (`config.json`, `entries.json`) and `auth.json`; recordings in the output folder; thumbnails in the cache dir.

## Build / scripts

- `npm run tauri dev` / `npm run tauri build`
- `scripts/fetch-ffmpeg.sh [current|macos-arm64|macos-x64]` — fetch the ffmpeg sidecar (macOS)
- `scripts/fetch-ffmpeg.ps1` — fetch the ffmpeg sidecar (Windows)
- `scripts/mock-sonde.mjs`, `scripts/replay-sonde-log.mjs` — feed the sensor API with weather‑balloon telemetry (synthetic / replay a bundled RS41 log); see `docs/sensor-api.md`
- `scripts/make_icon.py` — regenerate the app icon source (Pillow)
