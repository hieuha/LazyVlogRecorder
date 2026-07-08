# LazyCamHUD

> 🇬🇧 [English version](./README.md)

**LazyCamHUD** (tên hiển thị: *Lazy Camera HUD*) là ứng dụng desktop quay vlog bằng webcam, **đốt (burn) HUD sci‑fi kiểu phim *The Martian* thẳng vào video** — mission day, gauge thời tiết trực tiếp, vị trí, soundwave mic realtime và lớp CRT. Viết bằng **Tauri 2 + React/TypeScript**.

**Phiên bản:** 0.1.0 · **Nền tảng:** macOS + Windows (Linux hoãn sau)

## Ảnh chụp màn hình

| Khoá PIN | Đang quay |
| --- | --- |
| ![Màn khoá PIN](./docs/screenshot/1-lockscreen.webp) | ![Đang quay với HUD burned‑in](./docs/screenshot/2-video-recorder.webp) |
| **Xử lý → MP4** | **Thư viện log** |
| ![Overlay tiến trình transcode](./docs/screenshot/3-processing-video.webp) | ![Lưới thư viện log](./docs/screenshot/4-logs-library.webp) |

## Tính năng

- **HUD burned‑in** — webcam + HUD vẽ chung trên một `<canvas>` rồi ghi cùng nhau (không phải track overlay riêng).
- **HUD dữ liệu thật** — độ ẩm, khả năng mưa, nhiệt độ, tình trạng thời tiết, vị trí lấy từ Open‑Meteo + IP geolocation; có thể override city (geocode để thời tiết theo đúng nơi đó).
- **Chế độ quay** — `FIXED` (đếm ngược tự dừng) và `FREE` (dừng thủ công); pause/resume; đổi camera giữa chừng vẫn giữ recording, chèn hiệu ứng nhiễu + thu tròn về tâm.
- **Xuất MP4** — WebM → MP4 (H.264/AAC, faststart) qua ffmpeg static bundle; ghi stream ra file tạm (RAM phẳng) kèm overlay tiến trình.
- **Layout** — registry data‑driven; có sẵn `Martian` và `Minimal` (thêm layout = thêm 1 file).
- **Hiệu ứng** — lớp grain CRT, color grade điện ảnh, lật gương camera — bật/tắt được.
- **Khoá PIN** — mã 4 số khi mở app, luồng đổi PIN, nút lock.
- **Library** — mỗi bản quay được index kèm thumbnail; xem dạng lưới, player trong app, mở thư mục, xoá.
- **Settings bền** — tên, số log (tự tăng), thư mục lưu, thời lượng, layout, audio, mirror, CRT, city.

## Chạy nhanh (dev)

```bash
npm install
./scripts/fetch-ffmpeg.sh   # tải ffmpeg bundle theo OS/arch
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

Kết quả ở `src-tauri/target/release/bundle/` (`.app` + `.dmg` trên macOS). Xem [docs/deployment-guide.md](./docs/deployment-guide.md).

## Nơi lưu dữ liệu (macOS)

Theo bundle identifier `com.hatrunghieu.lazycamhud`:

- `~/Library/Application Support/com.hatrunghieu.lazycamhud/` — `config.json`, `entries.json`, `auth.json` (PIN)
- `~/Library/Caches/com.hatrunghieu.lazycamhud/thumbs/` — thumbnail
- `~/Movies/LazyCamHUD/` — video (hoặc thư mục bạn chọn)

## Lưu ý bảo mật

PIN chỉ là **khoá UX**, không phải mã hoá — video lưu **không mã hoá** trên disk. Ai truy cập được ổ đĩa vẫn đọc được.

## Tài liệu

- [Tổng quan dự án](./docs/vi/project-overview.md)
- [Kiến trúc hệ thống](./docs/vi/system-architecture.md)
- [Tóm tắt codebase](./docs/vi/codebase-summary.md)
- [Hướng dẫn sử dụng](./docs/vi/usage-guide.md)
- [Hướng dẫn triển khai](./docs/vi/deployment-guide.md)
- English: [docs/](./docs/)

## Công nghệ

Tauri 2 (Rust) · React 19 + TypeScript + Vite · Canvas2D HUD · Web Audio · Open‑Meteo · ffmpeg bundle.
