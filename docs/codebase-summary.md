# Codebase Summary — LazyCamHUD

## Frontend (`src/`)

| Path | Responsibility |
|------|----------------|
| `App.tsx` | Orchestrator: auth gate, camera/mic init, compositor + HUD wiring, controls, settings/library, Space hotkey; starts/stops the sensor server and feeds `sensors`/`series`/`text` events into the HUD; on iOS listens to visibilitychange for sensor API foreground-only lifecycle |
| `platform/platform.ts` | Runtime platform detection via `tauri-plugin-os` — `isIOS` and `isMacOS` flags. Used to gate Go Live (desktop-only) and sensor API foreground restart (iOS-only) |
| `compositor/canvas-compositor.ts` | Single‑canvas rAF loop (capped to capture FPS): draws webcam (cover, mirror), runs HUD layers, CRT overlay, camera‑switch static/collapse transition; fixed 16:9 backing store via `setResolution` (720p/1080p); `captureStream` source |
| `compositor/media-devices.ts` | Permissions, device enumeration, `openVideoStream` / `openAudioStream` (kept separate) |
| `hud/layout-engine.ts` | Resolves widget anchors → canvas points (incl. top/bottom‑center), dispatches to widgets |
| `hud/layouts/*.layout.ts` | Declarative layouts (`martian`, `minimal`, `recon`) + `layout-registry.ts` |
| `hud/theme.ts` · `hud/theme-registry.ts` | HUD palettes (`martianTheme` teal, `marsAmberTheme`, `greenHackerTheme`, `cryptTheme` crimson) + selectable-theme registry; a theme restyles any layout |
| `hud/widgets/*` | Canvas2D widgets: gauge‑arc (number + ring + unit on shared baseline), readouts (clock, mission‑day, location, environment, log‑entry), soundwave, frame/grid‑mesh/color‑grade, CRT (`signal-noise`), text primitives, and the sensor API widgets (`sensor-panel`, `series-panel` sparklines, `caption` typewriter + idle hex); `vitals-strip-widget` (battery, CPU, RAM, uptime icons) |
| `hud/audio-analyser.ts` | Web Audio analyser → rolling amplitude for the soundwave |
| `data/*` | `geolocation-client`, `weather-client`, `metric-mapping`, `hud-data-source` (fetch + cache + geocode override) |
| `recording/*` | `capability.ts` (H.264 support probing), `recorder` (MediaRecorder + chunk streaming), `screen-wake-lock.ts` (Screen Wake Lock API; keeps screen awake during capture on iOS/macOS), `use-capture-timer` (shared elapsed/pause/FIXED-auto-stop), `use-recorder` (copy vs transcode paths, iOS fast-forward MP4, wired wake lock), `recording-controls` (LOCAL/LIVE toggle hidden on iOS), `save-client`, `output-naming` |
| `streaming/*` | **Desktop-only.** `stream-client` (RTMP invoke wrappers), `use-streaming` (live state machine; taps the recorder, RTMP via `write_stream_chunk`, wired wake lock) |
| `settings/*` | `config-store` (Tauri Store; record resolution, sensor API bind host + token, streaming settings; `sensorApiBindHost` replaces old `sensorApiLan` bool), `settings-panel` (hides streaming on iOS), `is-stream-configured` (LIVE gate, false on iOS) |
| `auth/*` | `pin-gate`, `pin-pad`, `change-pin-flow`, `auth-client` |
| `library/*` | `entries-store`, `library-client`, `library-view` (grid, player, delete, on-demand thumbnail regeneration), `thumbnail.ts` (webview-rendered frame grab → JPEG, no ffmpeg) |
| `components/hud-select.tsx` | Custom themed dropdown (replaces native `<select>`) |

## Backend (`src-tauri/`)

| Path | Responsibility |
|------|----------------|
| `src/lib.rs` | Registers plugins (opener, store, dialog, os); two invoke_handler lists: `#[cfg(desktop)]` with ffmpeg + streaming, `#[cfg(not(desktop))]` without; manages `TempWriters` and `StreamState` |
| `src/commands/mod.rs` | Command modules: public on all platforms (auth, geo, weather, recording_fs, library, sensor_server, system_vitals); desktop-only (ffmpeg, streaming) behind `#[cfg(desktop)]` |
| `src/commands/auth.rs` | `has_pin` / `set_pin` / `verify_pin` / `change_pin`: salt + SHA‑256 stored in OS Keychain (macOS + iOS); migrates from old `auth.json` on first run |
| `src/commands/geo.rs` | `geo_locate` (IP), `geocode_city` (Open‑Meteo geocoding) |
| `src/commands/weather.rs` | `get_weather` (Open‑Meteo current + hourly precip probability) |
| `src/commands/recording_fs.rs` | `start_temp_recording`, `append_temp_chunk`, `close_temp_recording`, `move_temp`, `delete_files`, `resolve_out_dir` (macOS `video_dir` or Downloads; iOS `document_dir`); temp files in `std::env::temp_dir()` |
| `src/commands/library.rs` | `save_thumbnail`: persists JPEG bytes (from webview) to `app_data_dir/thumbs/{id}.jpg` (not Caches, so iOS doesn't purge on update) |
| `src/commands/ffmpeg.rs` | **Desktop-only.** `transcode_to_mp4` (H.264 CRF‑26 or remux, progress events), `remux_to_mp4` (faststart remux), `generate_thumbnail` (REMOVED on iOS); self‑resolves ffmpeg path from `tauri.macos.conf.json` |
| `src/commands/streaming.rs` | **Desktop-only.** `start_stream` / `write_stream_chunk` / `stop_stream`: RTMP‑only ffmpeg (H.264/AAC → FLV), constant bitrate CBR, pure `build_ffmpeg_stream_args`, bounded‑buffer backpressure, `stream-status` events, SIGTERM‑then‑SIGKILL teardown; single managed session |
| `src/commands/sensor_server.rs` | `start_sensor_server` / `stop_sensor_server` / `list_local_ips`: tiny_http server for `POST /sensors` (readouts), `/series` (sparklines), `/text` (caption); bearer token, `bind_host` (127.0.0.1 / 0.0.0.0 / LAN IP), emits events to the HUD |
| `src/commands/system_vitals.rs` | `get_system_vitals`: CPU %, memory %, uptime (via `sysinfo`, cross-platform); battery via `starship-battery` (desktop-only, returns None on iOS) |
| `tauri.conf.json` | Base config: productName, window, bundle (icons, asset protocol) |
| `tauri.macos.conf.json` | macOS-only overrides: `externalBin: ["binaries/ffmpeg"]` for the bundled ffmpeg |
| `binaries/` | Bundled ffmpeg (git‑ignored, fetched by `scripts/fetch-ffmpeg.sh` on macOS) |
| `src-tauri/gen/apple/` | iOS project structure (generated by `tauri ios init`); universal iPhone + iPad |
| `src-tauri/gen/apple/lazycamhud_iOS/lazycamhud_iOS.entitlements` | iOS entitlements: `com.apple.developer.default-data-protection = NSFileProtectionComplete` (encrypts recordings at rest while device locked) |

## Conventions

- Kebab‑case files for TS; snake_case for Rust; modules kept small and single‑purpose.
- HUD widgets are pure draw functions `(ctx, rect/props, theme, state)`.
- Persistent state lives in Tauri Store (`config.json`, `entries.json`); PIN in OS Keychain; recordings in platform-default folder (macOS `~/Movies/LazyCamHUD`, iOS `Documents/LazyCamHUD` with NSFileProtectionComplete encryption at rest); thumbnails in `app_data_dir/thumbs/` (survives iOS cache purges); temp files in `std::env::temp_dir()`.
- Platform gating: `#[cfg(desktop)]` for ffmpeg/streaming, `#[cfg(target_os = "ios")]` for iOS-specific logic, `isIOS` / `isMacOS` frontend flags for UI conditionals.
- Screen wake lock via `navigator.wakeLock.request("screen")` (iOS 16.4+, macOS WebKit) prevents device auto-lock during recording/streaming; best-effort fallback to OS default if unsupported.

## Build / scripts

- `npm run tauri dev` / `npm run tauri build`
- `scripts/fetch-ffmpeg.sh [current|macos-arm64|macos-x64]` — fetch the ffmpeg sidecar (macOS)
- `scripts/fetch-ffmpeg.ps1` — fetch the ffmpeg sidecar (Windows)
- `scripts/mock-sonde.mjs`, `scripts/replay-sonde-log.mjs` — feed the sensor API with weather‑balloon telemetry (synthetic / replay a bundled RS41 log); see `docs/sensor-api.md`
- `scripts/make_icon.py` — regenerate the app icon source (Pillow)

## Testing

- ~100 unit tests (Vitest) covering recorder durability, config, naming, weather codes, layout anchors, PIN flow, settings panel, HUD select, library view, RTMP URL validation, and keyboard shortcuts.
