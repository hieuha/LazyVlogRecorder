# Tổng quan dự án — LazyCamHUD

**LazyCamHUD** là ứng dụng desktop đa nền tảng để quay vlog "log entry" bằng webcam với HUD kiểu phim *The Martian* **đốt thẳng vào video**. Các gauge hiển thị thời tiết thật theo vị trí; toàn khung (webcam + HUD + hiệu ứng) được vẽ chung trên một canvas và ghi cùng nhau, nên file MP4 xuất ra đã có sẵn HUD.

- **Tên hiển thị:** Lazy Camera HUD
- **Bundle id:** `com.hatrunghieu.lazycamhud`
- **Phiên bản:** 0.6.5
- **Nền tảng:** macOS + Windows (Linux hoãn sau)
- **Công nghệ:** Tauri 2 (Rust) + React 19 + TypeScript + Vite

## Mục tiêu

- Công cụ "bấm quay là nói" với lớp overlay sci‑fi điện ảnh **là một phần của footage**.
- Dữ liệu thật, hữu ích trên HUD (thời tiết/vị trí), không phải số trang trí.
- Quay theo thời lượng cố định (vd 15 phút) hoặc quay tự do, UI đơn giản mà đẹp.

## Năng lực chính

| Mảng | Làm gì |
|------|--------|
| Quay | Chế độ FIXED (tự dừng) / FREE, pause/resume, đổi camera giữa chừng via **phím 1–4** hoặc dropdown kèm hiệu ứng nhiễu/thu tròn |
| Xuất | Hardware H.264 (nếu hỗ trợ, capped 12 Mbps) → remux nhanh sang MP4 (faststart); fallback VP8/WebM → transcode H.264 (CRF‑26, faststart) trên browser cũ; cố định 720p hoặc 1080p 16:9; stream ra file tạm; overlay tiến trình |
| HUD | Layout registry data‑driven (Martian, Minimal, Recon) + theme đổi được (Teal, Amber, Green, Crypt); gauge (độ ẩm có ring đơn vị trên cơ sở chung, mưa, nhiệt độ), environment, vị trí, ngày SOL, đồng hồ, log entry, soundwave mic; lưới toàn khung; tuỳ chọn Ship Vitals strip (pin, CPU, RAM, uptime) |
| Hiệu ứng | Grain CRT, color grade, mirror, lưới — bật/tắt |
| Dữ liệu | IP geolocation + Open‑Meteo; override city được geocode |
| Sensor API | Endpoint HTTP nội bộ (`/sensors`, `/series`, `/text`) đẩy readouts, biểu đồ sparkline, và caption typewriter lên HUD; token + bind LAN; kèm script mô phỏng bóng thám không; auto-start ổn định |
| Auth | Khoá PIN 4 số, đổi PIN, nút lock |
| Library | Bản quay được index kèm thumbnail; lưới, player trong app, mở thư mục, xoá |
| Settings | Lưu qua Tauri Store (tên, số log, thư mục, thời lượng, độ phân giải, layout, theme, Ship Vitals toggle, audio, mirror, CRT, city) |

## Không nằm trong phạm vi (hiện tại)

- Không upload cloud, không edit/trim, không ghép nhiều camera.
- Không mã hoá at‑rest — PIN chỉ là khoá UX.
- Không build iOS/iPad (iOS cấm spawn tiến trình con cho ffmpeg).

## Quyết định then chốt

- **HUD trên một canvas** để `canvas.captureStream()` + `MediaRecorder` ghi webcam + HUD burned‑in cùng lúc.
- **ffmpeg bundle chạy như tiến trình con** (tự tìm path dev vs bundle) thay vì codec webview, để MP4 ổn định.
- **Tách stream mic (audio) và camera (video)** để đổi camera giữa chừng vẫn giữ audio liên tục.

Xem [system-architecture.md](./system-architecture.md) và [codebase-summary.md](./codebase-summary.md).
