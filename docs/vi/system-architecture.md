# Kiến trúc hệ thống — LazyCamHUD

## Tổng thể

```
┌────────────────── Frontend (React + TS + Vite) ─────────────────┐
│ PIN gate ──► App                                                │
│   getUserMedia(video) + getUserMedia(audio)  [stream tách biệt] │
│        │ video                                                  │
│        ▼                                                        │
│   CanvasCompositor (vòng rAF, một <canvas>)                     │
│     ├─ vẽ frame webcam (cover, mirror tuỳ chọn)                 │
│     ├─ HUD layer = layout-engine(layout, state)                │
│     └─ overlay CRT + hiệu ứng chuyển camera                    │
│        │ canvas.captureStream(30).videoTrack                    │
│        │ + mic audioTrack ─► MediaRecorder (WebM, chunk)       │
│        ▼ ghi từng chunk                                         │
│   file tạm  ─────────────invoke──────────────►                  │
└────────┼────────────────────────────────────────────────────────┘
         ▼
┌────────────────── Backend (Rust / Tauri commands) ─────────────┐
│ ffmpeg (bundle): WebM tạm ─► MP4 (H.264/AAC, faststart)        │
│   emit sự kiện transcode-progress                              │
│ recording_fs: start/append/move temp, delete, save            │
│ proxy geo/weather (không CORS, không key); geocode city       │
│ auth: hash PIN (SHA-256 + salt) trong auth.json               │
│ thumbnail ffmpeg; asset protocol để phát file local           │
└────────────────────────────────────────────────────────────────┘
```

## Bất biến (invariants)

- **HUD nằm trên canvas, không phải DOM.** MediaRecorder chỉ ghi được `<canvas>`/stream, nên webcam + HUD vẽ chung một canvas; canvas đó vừa là preview vừa là nguồn `captureStream()` → HUD được burned‑in.
- **Layout data‑driven.** Layout là danh sách widget spec khai báo (`{type, anchor, offset, …}`). Engine giải anchor → điểm canvas rồi gọi hàm vẽ widget. Thêm layout = 1 file + 1 dòng registry.
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
- Refresh ~10 phút; cache last‑good; offline lần đầu hiện `UNKNOWN` / `--`.

## Auth

- `set_pin` / `verify_pin` / `change_pin`: SHA‑256 + salt lưu `auth.json` (thư mục config). Đây là **khoá UX**, không mã hoá. Khi lock, camera/stream được nhả và app về màn PIN; compositor được null để bind lại canvas mới mount khi mở khoá.

## Bundle ffmpeg

Đóng gói dạng binary static (theo target triple) trong `src-tauri/binaries/` (git‑ignore, tải bằng `scripts/fetch-ffmpeg.sh`). Runtime tự tìm từ thư mục exe (bundle) hoặc `CARGO_MANIFEST_DIR/binaries` (dev). iOS bị chặn vì cấm spawn tiến trình con.
