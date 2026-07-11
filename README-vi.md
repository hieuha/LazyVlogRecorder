# LazyCamHUD

> 🇬🇧 [English](./README.md)

_Một cuốn nhật ký video mỗi ngày — một gương mặt, một giọng nói, một ngày tháng — được burn lớp HUD phi thuyền và truyền đi từ một nơi rất xa._

## Log entry

Có những ngày mình thấy như đang ở nơi rất xa, trôi giữa các vì sao trong một trạm nghiên cứu bỏ hoang, còn những người mình thương vẫn ở lại Trái Đất.

LazyCamHUD là cách mình ghi lại tín hiệu ấy. Mỗi đoạn clip là một bản log trong ngày, với lớp HUD kiểu bảng điều khiển tàu vũ trụ burn thẳng vào khung hình — mission day, thời tiết nơi mình đang đứng, một soundwave nhấp nhô mỗi khi mình cất tiếng. Tín hiệu nhiễu, hơi trễ, không hoàn hảo. Nhưng là thật.

Một ngày nào đó, nhiều năm sau, con gái mình sẽ mở những đoạn này ra và biết chính xác bố đã ở đâu — và rằng suốt thời gian đó, bố vẫn luôn nghĩ về con.

> Câu chuyện đằng sau: [**Tôi đang mắc kẹt ở Sao Hỏa**](https://hatrunghieu.com/posts/lazycamhud-toi-dang-mac-ket-o-sao-hoa)

Và đây — công cụ để làm ra cuốn nhật ký đó. Xây bằng **Tauri 2 + React/TypeScript**.

**Phiên bản:** 0.6.5 · **Nền tảng:** macOS (Windows đã code nhưng chưa kiểm chứng · Linux tạm hoãn)

## Ảnh chụp

| Khóa PIN | Đang quay |
| --- | --- |
| ![Màn khóa PIN](./docs/screenshot/1-lockscreen.webp) | ![Quay với HUD burn-in](./docs/screenshot/2-video-recorder.webp) |
| **Xử lý → MP4** | **Thư viện log** |
| ![Overlay xử lý](./docs/screenshot/3-processing-video.webp) | ![Thư viện log](./docs/screenshot/4-logs-library.webp) |

![Sensor + sparkline trên HUD](./docs/screenshot/5-sensor-series-chart.webp)

## Nó làm được gì

- **HUD burn-in** — webcam + HUD trên cùng một `<canvas>`, quay chung (không phải track overlay riêng).
- **Dữ liệu trực tiếp** — thời tiết (độ ẩm / mưa / nhiệt độ / điều kiện) + vị trí từ Open‑Meteo + IP geo; ghi đè thành phố.
- **Quay** — chế độ `FIXED` (tự dừng) / `FREE`, pause/resume, đổi camera giữa chừng với hiệu ứng mất tín hiệu. Cố định **720p/1080p**. Quay **H.264 phần cứng → remux ra MP4** (lưu gần như tức thì); dự phòng VP8 + transcode.
- **Go Live (RTMP/RTMPS)** — phát canvas burn-in + mic (YouTube/Facebook/Twitch) qua ffmpeg bundled, tùy chọn **lưu MP4 local song song** mà mạng lag không làm hỏng được. Chỉnh FPS/bitrate; độ phân giải stream = độ phân giải record; tự dừng khi mạng chậm kéo dài. Stream key lưu cục bộ, không log.
- **Layout / Theme** — data-driven; `Martian`, `Minimal`, `Recon` × `Teal`, `Amber`, `Green`, `Crypt`. Thêm 1 cái = 1 file/entry.
- **Hiệu ứng** — lớp phủ lưới + hạt CRT, color grade điện ảnh, lật gương camera.
- **Sensor API** — đẩy readout, sparkline, caption của bạn lên HUD qua HTTP cục bộ ([bên dưới](#sensor-api)).
- **Ship Vitals** — dải pin/CPU/RAM/uptime (tùy chọn) · **Thư viện** — lưới thumbnail, player trong app, xóa · **Khóa PIN** — cổng 4 số.
- **Phím tắt** — `Space` bật/tắt quay · `1`–`4` đổi camera.

## Bắt đầu nhanh

```bash
npm install
./scripts/fetch-ffmpeg.sh          # Windows: scripts\fetch-ffmpeg.ps1
npm run tauri dev                  # hoặc: npm run tauri build
```

`build` xuất ra `src-tauri/target/release/bundle/` (`.app` + `.dmg` trên macOS).

## Sensor API

Bật **Settings → API Service**, rồi đẩy text hiển thị lên HUD (burn vào video):

```bash
curl -X POST http://<host>:1337/sensors -H "Authorization: Bearer <token>" \
  -d '{"items":[{"label":"CO2","value":"812","unit":"ppm"}]}'
```

- `POST /sensors` readout · `POST /series` điểm sparkline · `POST /text` caption typewriter · `GET /healthz` kiểm tra sống.
- Token + port + LAN trong Settings (LAN bind `0.0.0.0` và **bắt buộc** token). Giới hạn: ≤6 item, body ≤8 KB, chỉ nhận text hiển thị.
- Thử: `node scripts/mock-sonde.mjs <token>`. Tham khảo đầy đủ: **[docs/sensor-api.md](./docs/sensor-api.md)**.

## Lưu trữ & bảo mật (macOS)

Dưới `com.hatrunghieu.lazycamhud`: config/entries/PIN trong Application Support, thumbnail trong Caches, video trong `~/Movies/LazyCamHUD/` (hoặc thư mục bạn chọn). PIN là **khóa UX, không phải mã hóa** — video lưu **không mã hóa**.

## Tài liệu

[Tổng quan](./docs/vi/project-overview.md) · [Kiến trúc](./docs/vi/system-architecture.md) · [Codebase](./docs/vi/codebase-summary.md) · [Hướng dẫn dùng](./docs/vi/usage-guide.md) · [Sensor API](./docs/sensor-api.md) · [English](./README.md)

## Công nghệ

Tauri 2 (Rust) · React 19 + TypeScript + Vite · Canvas2D HUD · Web Audio · Open‑Meteo · ffmpeg bundled.
