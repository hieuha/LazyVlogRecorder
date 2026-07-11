# System Architecture — LazyCamHUD

## High level

**Apple-only (macOS + iOS/iPadOS).** One Tauri codebase, two artifacts: macOS desktop app + iOS universal (iPhone + iPad).

```
┌────────────────── Frontend (React + TS + Vite) ─────────────────┐
│ PIN gate ──► App                                                │
│   getUserMedia(video) + getUserMedia(audio)  [separate streams] │
│        │ video                                                  │
│        ▼                                                        │
│   CanvasCompositor (rAF ~60fps, one 16:9 <canvas>, 720p/1080p)  │
│     ├─ draw webcam frame (cover, optional mirror)               │
│     ├─ HUD layer  = layout-engine(layout, state)                │
│     └─ CRT overlay + switch transition                          │
│        │ canvas.captureStream(fps).videoTrack (H.264 on iOS)    │
│        │ + mic audioTrack ─► MediaRecorder (H.264/AAC or VP8)   │
│        ▼ append each chunk                                      │
│   temp file (fragmented MP4, moov at front on iOS WebKit)       │
│         │                                                       │
│   sensor events (sensors/series/text) ◄── Tauri events ──┐      │
└────────┼─────────────────────────────────────────────────┼──────┘
         ▼                                                  │
┌────────────────── Backend (Rust / Tauri commands) ───────┼─────┐
│ [Desktop only]                                           │     │
│  ffmpeg (bundled): temp WebM ─► MP4 (H.264/AAC)          │     │
│   emits transcode-progress events                        │     │
│  streaming: RTMP ffmpeg (H.264/AAC → FLV)                │     │
│                                                          │     │
│ [Both platforms]                                         │     │
│  recording_fs: start/append/close temp, move, delete     │     │
│  library: save_thumbnail (webview-rendered JPEG)         │     │
│  geo/weather proxies (no CORS, keyless); geocode city    │     │
│  auth: PIN hash (SHA-256 + salt) in OS Keychain         │     │
│  sensor_server (tiny_http): /sensors /series /text ──────┘     │
│  system_vitals: CPU/RAM/uptime (+ battery on macOS)            │
│  asset protocol for local playback                            │
└────────────────────────────────────────────────────────────────┘
```

## Invariants

- **HUD lives on the canvas, not the DOM.** MediaRecorder can only record a `<canvas>`/stream, so webcam + HUD are composited on one canvas; that same canvas is both the preview and the `captureStream()` source → the HUD is burned in.
- **Layout is data‑driven.** A layout is a declarative list of widget specs (`{type, anchor, offset, …}`). The engine resolves anchors → canvas points and dispatches to widget draw functions. Adding a layout is one file + one registry entry.
- **Theme is decoupled from layout.** A theme is just a palette (`HudTheme`) in its own registry; the selected theme is applied over whichever layout is active (`createHudLayer(layout, getState, themeOverride)`), so any theme works with any layout. Layout and theme both apply live from Settings (no Save) and persist immediately.
- **Audio and video streams are separate.** Switching the camera swaps only the video stream; the mic track held by MediaRecorder stays live, so recording continues (a static + collapse‑to‑center transition covers the gap).
- **Flat memory recording.** MediaRecorder chunks (1s) stream to a temp file via `append_temp_chunk`; the whole clip is never held in RAM, and bytes cross IPC as **raw octet-stream binary** (not JSON arrays), reducing main-thread load. Local recording holds **one append file handle per take** (server-side, closed before export) instead of reopening per chunk.
- **Chunk-write failures are surfaced.** Write failures flag the saved take as possibly-incomplete instead of being silently swallowed; the recording write queue is bounded and auto-stops the take if the disk falls behind.
- **Screen stays awake during capture.** The Screen Wake Lock API (`navigator.wakeLock.request("screen")`) keeps the display on during recording and streaming, preventing iOS auto-lock from suspending the app. Best-effort; falls back to OS default if unsupported.

## Recording → export pipeline

**iOS (copy path):** WebKit records to a fragmented MP4 with the moov box at the front (faststart) — seekable and playable as-is, already H.264/AAC.
1. `start_temp_recording("mp4")` → temp path.
2. MediaRecorder chunks → `append_temp_chunk(path, bytes)` (raw MP4 bytes).
3. On stop: `moveTemp(temp, name, outDir)` renames and indexes the file (no ffmpeg).
4. Entry indexed (`entries.json`) + thumbnail rendered in webview and persisted by `save_thumbnail`.

**macOS (fallback paths):**
- **Copy path (norm):** if webview recorded H.264, `moveTemp` is used (same as iOS).
- **Transcode path (fallback):** if webview recorded VP8/WebM, `transcode_to_mp4(temp, name, outDir, durationSec)` runs bundled ffmpeg on a blocking thread with `-progress pipe:1`, emitting `transcode-progress` (0..1).

On failure, `move_temp` keeps the raw file (never lose a take). Thumbnail is rendered in webview.

## Data layer

- `geo_locate` (ip‑api.com) → coordinates + city.
- `get_weather` (Open‑Meteo) → temperature, humidity, current‑hour precipitation probability, weather code.
- `geocode_city` (Open‑Meteo geocoding) → coordinates for a city override so weather follows the chosen place.
- `get_system_vitals` (Rust: `sysinfo` + `starship-battery`) → battery %, charging state, CPU %, memory %, machine uptime (seconds). Polled every ~2s (not per-frame) and cached with a ~6s stale timeout; disabled when `showVitals` is false.
- Refreshes every ~10 min (weather); caches last‑good; offline first‑launch shows UNKNOWN / `--`.

## Recording resolution & codec

- The canvas backing store is a **fixed 16:9 frame** (720p or 1080p from settings), not the window size — so output is deterministic and reasonably sized. The preview letterboxes to fit.
- **Capture path (iOS):** WebKit (Safari) records H.264 directly via hardware VideoToolbox (capped 12 Mbps) into a fragmented MP4 with the moov box at the front. This is a fast-forward MP4 (seekable immediately, playable without re-muxing). `moveTemp` just renames it into place.
- **Capture path (macOS):** if the webview supports hardware H.264 codec, MediaRecorder emits H.264 (capped 12 Mbps) and the export is a fast remux to MP4 (faststart) — no transcode. Falls back to VP8/WebM capture when software encoding is forced, then transcodes to **H.264 CRF‑26 (preset medium)** for smaller files.
- The compositor draw loop is capped at the capture rate (~30fps for streaming, ~60fps for recording) so ProMotion 120Hz displays don't waste CPU on frames the recorder never samples.

## Sensor API

- `sensor_server.rs` runs a small `tiny_http` server (background thread) started/stopped by `App` from settings. Bind is configurable: `127.0.0.1` (loopback, this device only), `0.0.0.0` (all interfaces, LAN), or a specific LAN IP (e.g. `192.168.1.10`). A bearer token is required for any network-facing bind (anything other than loopback). The server auto-starts reliably — `stop_sensor_server` joins the accept thread so the port is released before any restart/rebind, preventing "address already in use" errors.
- `POST /sensors` (scalar readouts), `POST /series` (numeric points → sparkline buffer), `POST /text` (typewriter caption). Each validated + clamped, then forwarded to the frontend via Tauri events (`sensors`/`series`/`text`).
- `list_local_ips` returns `127.0.0.1`, `0.0.0.0`, and detected IPv4 LAN addresses so the user can see which bind options are available.
- The frontend injects these into `HudState` each frame, so they render as HUD widgets and are **burned into the recording** like everything else.
- **iOS:** sensor API is foreground-only (closes when the app backgrounded). `App` listens to `visibilitychange` and auto-restarts the server on foreground (requires `NSLocalNetworkUsageDescription` in the iOS capability).

## Go Live (RTMP/RTMPS streaming)

- `streaming.rs` spawns ONE long-lived **RTMP-only** ffmpeg per session (Tauri managed state `Mutex<Option<StreamSession>>`, single-session). The **same** compositor canvas + mic MediaRecorder used for local recording is reused (500ms timeslice) — no second recorder.
- **Encode path (auto):** if the webview can record **H.264 directly** (`pickStreamH264Mime` — VideoToolbox HW on macOS), the recorder emits H.264 (capped 12 Mbps) and ffmpeg does **`-c copy`** (remux only, no decode/encode) — a single hardware encode that avoids the CPU-heavy double-encode (VP8 encode → decode → H.264) that stuttered/froze capture. Else it falls back to reading WebM and **re-encoding** to H.264. In copy mode the stream is the canvas resolution (no ffmpeg scale); the local save is a fast **remux** (`remux_to_mp4`) instead of a transcode. Publishes **FLV over RTMP(S)**. Arg building is a pure, unit-tested fn (`build_ffmpeg_stream_args`).
- **Quality is user-tunable (OBS-style):** **FPS** (default 30, forced with `-r`) and **video bitrate** (default 4500k) live in Settings → Streaming. Stream resolution follows the record resolution (no separate stream resolution, since the `–c copy` remux path cannot downscale). Encoding is **constant bitrate (CBR)** (`-b:v` = `-maxrate`, 2s `-bufsize`) with `-realtime 1` (VideoToolbox) / `-tune zerolatency` (x264) for smooth low-latency live, so the broadcaster sees steady bitrate instead of VBR undershooting. GOP = `2×fps`. Software-encoder machines **clamp to 720p** (status flag `clamped`). To cut the capture-side cost of the intermediate VP8 (browser software encode), the live recorder also captures at the stream FPS and caps `videoBitsPerSecond` near the target.
- **Save-local is decoupled from the network.** Each recorder chunk is written two independent ways in `use-streaming.ts`: `append_temp_chunk` → a local temp file (full quality, every chunk), and `write_stream_chunk` → the RTMP ffmpeg (droppable under backpressure). On stop the temp file is remuxed or transcoded to MP4 via the **same `transcode_to_mp4` / `remux_to_mp4` pipeline as local recording** and indexed in the library. So a laggy/dropping network degrades only the broadcast — never the saved local take — and the two never share one throttled encode. (An earlier single-ffmpeg `tee` design was dropped: it corrupted the MP4's H.264 extradata and made the local file hostage to network backpressure.)
- **Backpressure:** RTMP chunks flow through a bounded channel (buffer ~8s) to a writer thread. When the network can't keep up the buffer saturates → `stream-status: unstable` (with a drop count); if saturated past ~15s **while live** the session **auto-stops** (`error`) rather than growing memory unbounded. Saturation during the connect handshake is not counted (avoids a false "network too slow").
- **Status:** stderr is parsed locally (`-progress pipe:2` → first `frame=` ⇒ `live`) into a `stream-status` event (`connecting|live|unstable|ended|error` + dropped + clamped). Raw stderr is never forwarded.
- **Teardown:** `stop_stream` is async + offloads the blocking wait/signal to `spawn_blocking` (no UI freeze). `StreamSession::Drop` closes stdin (clean EOF), escalates to **SIGTERM** (graceful RTMP disconnect), then SIGKILL as a last resort — killing the child before joining the writer so a write parked under backpressure can't hang shutdown, and no zombies.
- **Secret:** the stream key lives in `config.json` (plaintext, same posture as the sensor API token). It is composed into the RTMP URL **only inside the ffmpeg argv** — never logged, never in an event/stderr payload. Config-gated `GO LIVE` button (disabled + hint→Settings until URL+key set) + a confirm dialog guard against accidental broadcast.

## Auth & Security

- **PIN storage:** `set_pin` / `verify_pin` / `change_pin`: salted SHA‑256 stored in the **OS Keychain** (macOS + iOS via the Apple Security framework, `keyring` crate). This is a **UX lock**, not encryption. On lock, the camera/streams are released and the app returns to the PIN screen; the compositor is nulled so it rebinds the freshly‑mounted canvas on re‑unlock. The Keychain item is service-scoped to `com.hatrunghieu.lazycamhud` and account-scoped to `pin`, surviving updates and reinstalls.
- **Data protection (iOS):** Recordings created in the app sandbox (Documents) default to `NSFileProtectionComplete` (set in `lazycamhud_iOS.entitlements`), encrypting files at rest while the device is locked. On macOS, ~/Movies/LazyCamHUD recordings have no at-rest encryption (file system unencrypted by default).
- **Screen wake lock (iOS):** `screen-wake-lock.ts` uses the Screen Wake Lock API (WKWebView iOS 16.4+, macOS WebKit) to keep the screen awake during recording and streaming. Prevents device auto-lock from suspending the app mid-take. Acquired in `use-recorder.ts` / `use-streaming.ts` start, released on stop. Best-effort, no-op on older iOS or if permission denied.
- **Legacy migration:** Old `auth.json` is migrated to Keychain on first run; the file is cleaned up.

## ffmpeg bundling & desktop-only gating

**Desktop (macOS):** Bundled as a static binary under `src-tauri/binaries/` (git‑ignored, fetched by `scripts/fetch-ffmpeg.sh`). Configured in `tauri.macos.conf.json` as `externalBin: ["binaries/ffmpeg"]`. Used by `transcode_to_mp4` (fallback VP8 encode) and `streaming.rs` (RTMP).

**iOS:** ffmpeg is **not available** — iOS forbids spawning subprocesses. Instead:
- Recording export relies on the copy path (iOS WebKit delivers fast-forward MP4 as-is).
- Go Live is disabled (no streaming).
- Thumbnails are rendered in the webview (no `generate_thumbnail` ffmpeg call).

**Code gating:** Commands that spawn ffmpeg (`transcode_to_mp4`, `remux_to_mp4`, `streaming::start_stream`) are behind `#[cfg(desktop)]` in `lib.rs` so they don't compile on iOS. The mobile invoke_handler omits them.

## Features Not Yet Implemented

- **iOS Go Live (RTMP):** Requires HaishinKit integration or a native WebRTC solution; streaming is macOS-only for now.
- **Photos/Files export:** iOS UIFileSharingEnabled + Document picker integration for exporting recordings to Photos or the Files app; currently all recordings are app-sandboxed in Documents.
