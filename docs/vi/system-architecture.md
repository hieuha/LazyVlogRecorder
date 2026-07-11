# Kiến trúc hệ thống — LazyCamHUD

## Tổng thể

```
┌────────────────── Frontend (React + TS + Vite) ─────────────────┐
│ PIN gate ──► App                                                │
│   getUserMedia(video) + getUserMedia(audio)  [stream tách biệt] │
│        │ video                                                  │
│        ▼                                                        │
│   CanvasCompositor (rAF ~60fps, một <canvas> 16:9, 720p/1080p)  │
│     ├─ vẽ frame webcam (cover, mirror tuỳ chọn)                 │
│     ├─ HUD layer = layout-engine(layout, state)                │
│     └─ overlay CRT + hiệu ứng chuyển camera                    │
│        │ canvas.captureStream(30).videoTrack                    │
│        │ + mic audioTrack ─► MediaRecorder (VP8/WebM, chunk)   │
│        ▼ ghi từng chunk                                         │
│   file tạm  ─────────────invoke──────────────►                  │
│   sensor events (sensors/series/text) ◄── Tauri events ──┐      │
└────────┼─────────────────────────────────────────────────┼──────┘
         ▼                                                  │
┌────────────────── Backend (Rust / Tauri commands) ───────┼─────┐
│ ffmpeg (bundle): WebM tạm ─► MP4 (H.264/AAC CRF‑26)       │     │
│   emit sự kiện transcode-progress                        │     │
│ recording_fs: start/append/move temp, delete, save       │     │
│ proxy geo/weather (không CORS, không key); geocode city  │     │
│ auth: hash PIN (SHA-256 + salt) trong auth.json          │     │
│ sensor_server (tiny_http): /sensors /series /text ───────┘     │
│ thumbnail ffmpeg; asset protocol để phát file local           │
└────────────────────────────────────────────────────────────────┘
```

## Bất biến (invariants)

- **HUD nằm trên canvas, không phải DOM.** MediaRecorder chỉ ghi được `<canvas>`/stream, nên webcam + HUD vẽ chung một canvas; canvas đó vừa là preview vừa là nguồn `captureStream()` → HUD được burned‑in.
- **Layout data‑driven.** Layout là danh sách widget spec khai báo (`{type, anchor, offset, …}`). Engine giải anchor → điểm canvas rồi gọi hàm vẽ widget. Thêm layout = 1 file + 1 dòng registry.
- **Theme tách khỏi layout.** Theme chỉ là bảng màu (`HudTheme`) trong registry riêng; theme đang chọn được áp lên bất kỳ layout nào (`createHudLayer(layout, getState, themeOverride)`) → theme nào cũng dùng được với layout nào. Layout và theme đổi **live** ngay trong Settings (không cần Save) và lưu tức thì.
- **Tách stream audio và video.** Đổi camera chỉ thay video; track mic mà MediaRecorder đang giữ vẫn sống → recording tiếp tục (hiệu ứng nhiễu + thu tròn về tâm che khoảng chuyển).
- **Ghi RAM phẳng.** Chunk MediaRecorder (1s) stream ra file tạm qua `append_temp_chunk`; không giữ toàn bộ clip trong RAM; bytes qua IPC dạng **binary octet-stream thô** (không JSON array), giảm tải main-thread. Quay cục bộ giữ **một handle file append mỗi take** (server-side, đóng trước export) thay vì mở lại mỗi chunk.
- **Lỗi write được báo cáo.** Lỗi write đánh dấu bản quay lưu là possibly-incomplete thay vì im lặng; queue write quay bị giới hạn và tự dừng take nếu ổ đĩa tụt lại.

## Pipeline quay → xuất

1. `start_temp_recording(ext)` → path tạm.
2. Chunk `MediaRecorder` → `append_temp_chunk(path, bytes)`.
3. Khi stop: `transcode_to_mp4(temp, name, outDir, durationSec)` chạy ffmpeg bundle trên thread nền với `-progress pipe:1`, emit `transcode-progress` (0..1).
4. Thành công → xoá temp, MP4 vào thư mục lưu. Lỗi → `move_temp` giữ WebM thô (không mất bản quay).
5. Index entry (`entries.json`) + tạo thumbnail (`generate_thumbnail`).

## Tầng dữ liệu

- `geo_locate` (ip‑api.com) → toạ độ + city.
- `get_weather` (Open‑Meteo) → nhiệt độ, độ ẩm, khả năng mưa giờ hiện tại, weather code.
- `geocode_city` (Open‑Meteo geocoding) → toạ độ cho city override để thời tiết theo đúng nơi đó.
- `get_system_vitals` (Rust: `sysinfo` + `starship-battery`) → % pin, trạng thái sạc, CPU %, RAM %, uptime máy (giây). Poll ~2s (không phải per-frame) và cache với timeout stale ~6s; tắt khi `showVitals` false.
- Refresh ~10 phút (thời tiết); cache last‑good; offline lần đầu hiện `UNKNOWN` / `--`.

## Độ phân giải & codec

- Backing store của canvas là **khung 16:9 cố định** (720p hoặc 1080p theo settings), không theo kích thước cửa sổ — nên output ổn định và nhẹ. Preview letterbox cho vừa.
- **Đường dẫn quay (auto):** nếu webview hỗ trợ hardware H.264 codec, `MediaRecorder` phát H.264 (capped 12 Mbps) và export là remux nhanh sang MP4 (faststart) — không transcode. Fallback sang VP8/WebM quay trên trình duyệt cũ hoặc khi buộc software encode, rồi transcode sang **H.264 CRF‑26 (preset medium)** cho MP4 nhỏ.
- Vòng vẽ compositor giới hạn ~60fps để màn ProMotion 120Hz không vẽ HUD gấp đôi mỗi frame quay.

## Go Live (RTMP/RTMPS)

- `streaming.rs` spawn ONE long-lived **RTMP-only** ffmpeg mỗi session (Tauri managed state `Mutex<Option<StreamSession>>`, single-session). **Cùng** compositor canvas + mic `MediaRecorder` dùng cho quay local được tái sử dụng (500ms timeslice) — không recorder riêng.
- **Đường dẫn encode (auto):** nếu webview record **H.264 trực tiếp** (`pickStreamH264Mime` — VideoToolbox macOS), recorder phát H.264 (capped 12 Mbps) và ffmpeg làm **`-c copy`** (remux chỉ, không decode/encode) — một encode hardware tránh đôi encode nặng (VP8 encode → decode → H.264) gây giật/đông capture. Nếu không fallback đọc WebM rồi **re-encode** sang H.264. Chế độ copy: stream là canvas resolution (không ffmpeg scale); local save là remux nhanh (`remux_to_mp4`) thay vì transcode. Phát **FLV trên RTMP(S)**. Xây arg là pure, unit-tested fn (`build_ffmpeg_stream_args`).
- **Chất lượng user-tunable (OBS-style):** **FPS** (default 30, buộc bằng `-r`) và **video bitrate** (default 4500k) trong Settings → Streaming. Stream resolution theo record resolution (không separate stream resolution, vì đường `–c copy` remux không downscale được). Encode **constant bitrate (CBR)** (`-b:v` = `-maxrate`, 2s `-bufsize`) kèm `-realtime 1` (VideoToolbox) / `-tune zerolatency` (x264) cho live low-latency mượt, nên broadcaster thấy bitrate ổn định thay VBR tụt. GOP = `2×fps`. Machine software-encoder **clamp to 720p** (status flag `clamped`). Để giảm chi phí VP8 trung gian (browser software encode), live recorder cũng capture tại stream FPS và cap `videoBitsPerSecond` gần target.
- **Save-local tách khỏi mạng.** Mỗi recorder chunk ghi hai cách độc lập trong `use-streaming.ts`: `append_temp_chunk` → file tạm local (full quality, mỗi chunk), và `write_stream_chunk` → RTMP ffmpeg (dropped dưới backpressure). Khi stop file tạm được remux hoặc transcode sang MP4 qua **cùng `transcode_to_mp4` / `remux_to_mp4` pipeline như quay local** và index trong library. Nên mạng lag/drop chỉ ảnh hưởng broadcast — không bao giờ bản lưu — và hai cái không chia encode nào throttled. (Thiết kế single-ffmpeg `tee` trước bị drop: nó corrupt H.264 extradata MP4 và làm file local bị mạng làm con tin.)
- **Backpressure:** RTMP chunk chảy qua bounded channel (buffer ~8s) tới writer thread. Khi mạng không kịp buffer saturate → `stream-status: unstable` (kèm drop count); nếu saturate quá ~15s **while live** session **tự dừng** (`error`) thay vì RAM tăng vô hạn. Saturate khi connect handshake không tính (tránh false "network too slow").
- **Status:** stderr parse local (`-progress pipe:2` → `frame=` đầu ⇒ `live`) thành `stream-status` event (`connecting|live|unstable|ended|error` + dropped + clamped). Raw stderr không bao giờ forward.
- **Teardown:** `stop_stream` async + offload blocking wait/signal tới `spawn_blocking` (no UI freeze). `StreamSession::Drop` đóng stdin (clean EOF), escalate **SIGTERM** (graceful RTMP disconnect), rồi SIGKILL last resort — kill child trước join writer nên write parked backpressure không hang shutdown, no zombie.
- **Secret:** stream key ở `config.json` (plaintext, same posture sensor API token). Compose vào RTMP URL **chỉ trong ffmpeg argv** — never logged, never event/stderr payload. Config-gated `GO LIVE` button (disabled + hint→Settings đến khi URL+key set) + confirm dialog guard accidental broadcast.

## Sensor API

- `sensor_server.rs` chạy server `tiny_http` nhỏ (thread nền), được `App` bật/tắt theo settings. Bind `127.0.0.1` hoặc `0.0.0.0` (LAN); chế độ LAN bắt buộc bearer token. Server auto-start ổn định — `stop_sensor_server` join accept thread nên port được nhả trước khi restart/rebind, tránh lỗi "server didn't start" khi đổi settings hay relaunch.
- `POST /sensors` (readouts vô hướng), `POST /series` (điểm số → buffer sparkline), `POST /text` (caption typewriter). Mỗi cái được validate + clamp rồi forward lên frontend qua Tauri events (`sensors`/`series`/`text`).
- Frontend đưa vào `HudState` mỗi frame → vẽ thành widget HUD và **burn vào bản ghi** như mọi thứ khác.

## Auth

- `set_pin` / `verify_pin` / `change_pin`: SHA‑256 + salt lưu `auth.json` (thư mục config). Đây là **khoá UX**, không mã hoá. Khi lock, camera/stream được nhả và app về màn PIN; compositor được null để bind lại canvas mới mount khi mở khoá.

## Bundle ffmpeg

Đóng gói dạng binary static (theo target triple) trong `src-tauri/binaries/` (git‑ignore, tải bằng `scripts/fetch-ffmpeg.sh` trên macOS hoặc `scripts/fetch-ffmpeg.ps1` trên Windows). Runtime tự tìm từ thư mục exe (bundle) hoặc `CARGO_MANIFEST_DIR/binaries` (dev), kèm đuôi `.exe` trên Windows. iOS bị chặn vì cấm spawn tiến trình con.
