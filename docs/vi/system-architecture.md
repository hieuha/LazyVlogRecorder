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
- **Ghi RAM phẳng.** Chunk MediaRecorder (1s) stream ra file tạm qua `append_temp_chunk`; không giữ toàn bộ clip trong RAM; bytes qua IPC dạng `ArrayBuffer` thô (không `Array.from`).

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
- `MediaRecorder` ưu tiên **VP8** hơn VP9 (macOS không có hardware encode VP9; VP8 nhẹ hơn nhiều cho realtime), rồi transcode sang **H.264 CRF‑26 (preset medium)** cho MP4 nhỏ.
- Vòng vẽ compositor giới hạn ~60fps để màn ProMotion 120Hz không vẽ HUD gấp đôi mỗi frame quay.

## Sensor API

- `sensor_server.rs` chạy server `tiny_http` nhỏ (thread nền), được `App` bật/tắt theo settings. Bind `127.0.0.1` hoặc `0.0.0.0` (LAN); chế độ LAN bắt buộc bearer token.
- `POST /sensors` (readouts vô hướng), `POST /series` (điểm số → buffer sparkline), `POST /text` (caption typewriter). Mỗi cái được validate + clamp rồi forward lên frontend qua Tauri events (`sensors`/`series`/`text`).
- Frontend đưa vào `HudState` mỗi frame → vẽ thành widget HUD và **burn vào bản ghi** như mọi thứ khác.

## Auth

- `set_pin` / `verify_pin` / `change_pin`: SHA‑256 + salt lưu `auth.json` (thư mục config). Đây là **khoá UX**, không mã hoá. Khi lock, camera/stream được nhả và app về màn PIN; compositor được null để bind lại canvas mới mount khi mở khoá.

## Bundle ffmpeg

Đóng gói dạng binary static (theo target triple) trong `src-tauri/binaries/` (git‑ignore, tải bằng `scripts/fetch-ffmpeg.sh` trên macOS hoặc `scripts/fetch-ffmpeg.ps1` trên Windows). Runtime tự tìm từ thư mục exe (bundle) hoặc `CARGO_MANIFEST_DIR/binaries` (dev), kèm đuôi `.exe` trên Windows. iOS bị chặn vì cấm spawn tiến trình con.
