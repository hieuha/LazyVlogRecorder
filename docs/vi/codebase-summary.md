# Tóm tắt codebase — LazyCamHUD

## Frontend (`src/`)

| Đường dẫn | Trách nhiệm |
|-----------|-------------|
| `App.tsx` | Điều phối: khoá auth, init camera/mic, nối compositor + HUD, controls, settings/library, hotkey Space; bật/tắt sensor server và đưa event `sensors`/`series`/`text` vào HUD |
| `compositor/canvas-compositor.ts` | Vòng rAF một canvas (giới hạn ~60fps): vẽ webcam (cover, mirror), chạy HUD layer, overlay CRT, hiệu ứng nhiễu/thu tròn khi đổi camera; backing store 16:9 cố định qua `setResolution` (720p/1080p); nguồn `captureStream` |
| `compositor/media-devices.ts` | Quyền, liệt kê thiết bị, `openVideoStream` / `openAudioStream` (tách riêng) |
| `hud/layout-engine.ts` | Giải anchor widget → điểm canvas (gồm top/bottom‑center), gọi widget |
| `hud/layouts/*.layout.ts` | Layout khai báo (`martian`, `minimal`, `recon`) + `layout-registry.ts` |
| `hud/theme.ts` · `hud/theme-registry.ts` | Bảng màu HUD (`martianTheme` teal, `marsAmberTheme`, `greenHackerTheme`, `cryptTheme` đỏ huyết) + registry theme chọn được; theme restyle mọi layout |
| `hud/widgets/*` | Widget Canvas2D: gauge‑arc (số + ring + đơn vị trên cơ sở chung), readouts (clock, mission‑day, location, environment, log‑entry), soundwave, frame/grid‑mesh/color‑grade, CRT (`signal-noise`), text primitives, và các widget sensor API (`sensor-panel`, `series-panel` sparkline, `caption` typewriter + idle hex); `vitals-strip-widget` (icon pin, CPU, RAM, uptime) |
| `hud/audio-analyser.ts` | Web Audio analyser → biên độ cuộn cho soundwave |
| `data/*` | `geolocation-client`, `weather-client`, `metric-mapping`, `hud-data-source` (fetch + cache + geocode override) |
| `recording/*` | `recorder` (MediaRecorder + stream chunk), `use-recorder` (mode, timer, pause/resume, remux hoặc transcode + progress), `recording-controls`, `save-client`, `output-naming` |
| `settings/*` | `config-store` (Tauri Store; gồm độ phân giải quay + sensor API port/LAN/token; không streamHeight), `settings-panel` |
| `auth/*` | `pin-gate`, `pin-pad`, `change-pin-flow`, `auth-client` |
| `library/*` | `entries-store`, `library-client`, `library-view` (lưới, player, xoá) |
| `components/hud-select.tsx` | Dropdown tuỳ biến theo theme (thay `<select>` native) |

## Backend (`src-tauri/`)

| Đường dẫn | Trách nhiệm |
|-----------|-------------|
| `src/lib.rs` | Đăng ký plugin (opener, store, dialog) + toàn bộ command |
| `src/commands/auth.rs` | `has_pin` / `set_pin` / `verify_pin` / `change_pin` |
| `src/commands/geo.rs` | `geo_locate` (IP), `geocode_city` (Open‑Meteo geocoding) |
| `src/commands/weather.rs` | `get_weather` (Open‑Meteo current + hourly precip) |
| `src/commands/recording_fs.rs` | `start_temp_recording`, `append_temp_chunk`, `move_temp`, `delete_files`, `resolve_out_dir` |
| `src/commands/ffmpeg.rs` | `transcode_to_mp4` (H.264 CRF‑26 hoặc remux, sự kiện progress), `remux_to_mp4` (faststart remux), `generate_thumbnail`; tự tìm path ffmpeg (`.exe` trên Windows) |
| `src/commands/streaming.rs` | `start_stream` / `write_stream_chunk` / `stop_stream`: RTMP-only ffmpeg (H.264/AAC → FLV), constant bitrate CBR, pure `build_ffmpeg_stream_args`, bounded-buffer backpressure, `stream-status` events, SIGTERM-then-SIGKILL teardown; single managed session |
| `src/commands/system_vitals.rs` | `get_system_vitals`: % pin, trạng thái sạc, CPU %, RAM %, uptime (qua `sysinfo` + `starship-battery`); pin null trên máy không có |
| `tauri.conf.json` | productName, window, bundle (icon, ffmpeg `externalBin`, entitlements), asset protocol |
| `binaries/` | ffmpeg bundle theo target (git‑ignore, qua `scripts/fetch-ffmpeg.sh`) |

## Quy ước

- File kebab‑case cho TS; snake_case cho Rust; module nhỏ, một nhiệm vụ.
- Widget HUD là hàm vẽ thuần `(ctx, rect/props, theme, state)`.
- State bền ở Tauri Store (`config.json`, `entries.json`) và `auth.json`; video ở thư mục lưu; thumbnail ở thư mục cache.

## Build / scripts

- `npm run tauri dev` / `npm run tauri build`
- `scripts/fetch-ffmpeg.sh [current|macos-arm64|macos-x64]` — tải ffmpeg sidecar (macOS)
- `scripts/fetch-ffmpeg.ps1` — tải ffmpeg sidecar (Windows)
- `scripts/mock-sonde.mjs`, `scripts/replay-sonde-log.mjs` — bơm telemetry bóng thám không vào sensor API (tổng hợp / phát lại log RS41 kèm sẵn); xem `docs/sensor-api.md`
- `scripts/make_icon.py` — tạo lại ảnh nguồn icon (Pillow)

## Kiểm thử

- ~100 unit test (Vitest) bao phủ tính ổn định recorder, cấu hình, đặt tên, mã thời tiết, anchor layout, PIN flow, settings panel, HUD select, library view, RTMP URL validation, và keyboard shortcuts.
