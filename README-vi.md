# LazyCamHUD

> 🇬🇧 [English version](./README.md)

**LazyCamHUD** (tên hiển thị: *Lazy Camera HUD*) là ứng dụng desktop quay vlog bằng webcam, **đốt (burn) HUD sci‑fi kiểu phim *The Martian* thẳng vào video** — mission day, gauge thời tiết trực tiếp, vị trí, soundwave mic realtime và lớp CRT. Viết bằng **Tauri 2 + React/TypeScript**.

**Phiên bản:** 0.4.0 · **Nền tảng:** macOS + Windows (Linux hoãn sau)

## Ảnh chụp màn hình

| Khoá PIN | Đang quay |
| --- | --- |
| ![Màn khoá PIN](./docs/screenshot/1-lockscreen.webp) | ![Đang quay với HUD burned‑in](./docs/screenshot/2-video-recorder.webp) |
| **Xử lý → MP4** | **Thư viện log** |
| ![Overlay tiến trình transcode](./docs/screenshot/3-processing-video.webp) | ![Lưới thư viện log](./docs/screenshot/4-logs-library.webp) |

Sensor API — số liệu ngoài + biểu đồ sparkline đẩy qua HTTP:

![Số liệu sensor và biểu đồ sparkline trên HUD](./docs/screenshot/5-sensor-series-chart.webp)

## Tính năng

- **HUD burned‑in** — webcam + HUD vẽ chung trên một `<canvas>` rồi ghi cùng nhau (không phải track overlay riêng).
- **HUD dữ liệu thật** — độ ẩm, khả năng mưa, nhiệt độ, tình trạng thời tiết, vị trí lấy từ Open‑Meteo + IP geolocation; có thể override city (geocode để thời tiết theo đúng nơi đó).
- **Chế độ quay** — `FIXED` (đếm ngược tự dừng) và `FREE` (dừng thủ công); pause/resume; đổi camera giữa chừng vẫn giữ recording, chèn hiệu ứng nhiễu + thu tròn về tâm.
- **Xuất MP4** — quay VP8/WebM ở **720p hoặc 1080p** cố định (16:9), rồi transcode sang MP4 (H.264/AAC, CRF‑26, faststart) qua ffmpeg static bundle; ghi stream ra file tạm (RAM phẳng) kèm overlay tiến trình.
- **Layout** — registry data‑driven; có sẵn `Martian` và `Minimal` (thêm layout = thêm 1 file).
- **Hiệu ứng** — lớp grain CRT, color grade điện ảnh, lật gương camera — bật/tắt được.
- **Khoá PIN** — mã 4 số khi mở app, luồng đổi PIN, nút lock.
- **Library** — mỗi bản quay được index kèm thumbnail; xem dạng lưới, player trong app, mở thư mục, xoá.
- **Settings bền** — tên, số log (tự tăng), thư mục lưu, thời lượng, độ phân giải (720p/1080p), layout, audio, mirror, CRT, city.

## Chạy nhanh (dev)

```bash
npm install
./scripts/fetch-ffmpeg.sh   # macOS: tải ffmpeg bundle theo arch
npm run tauri dev
```

Trên **Windows**, tải ffmpeg bằng script PowerShell:

```powershell
npm install
powershell -ExecutionPolicy Bypass -File scripts\fetch-ffmpeg.ps1
npm run tauri dev
```

> Linux tạm hoãn — WebKitGTK hỗ trợ `MediaRecorder`/`captureStream` không ổn định nên việc quay không đáng tin cậy.

## Build

```bash
npm run tauri build
```

Kết quả ở `src-tauri/target/release/bundle/` (`.app` + `.dmg` trên macOS). Xem [docs/deployment-guide.md](./docs/deployment-guide.md).

## Sensor API

Bật **Settings → Sensor API** để đẩy dữ liệu cảm biến của bạn lên góc phải HUD (burn vào video). App chạy một endpoint HTTP nhỏ:

```bash
curl -X POST http://<host>:1337/sensors \
  -H "Authorization: Bearer <token>" \
  -d '{"items":[{"label":"CO2","value":"812","unit":"ppm"},{"label":"HR","value":"78","unit":"bpm"}]}'
```

- Phản hồi: `200 {"ok":true,"count":N}` khi thành công; `401` sai token, `400` JSON lỗi, `413` quá lớn (đều kèm `error` JSON). Thêm `-i` vào `curl` để thấy status.
- Port, cho phép LAN, và token đều chỉnh trong Settings.
- Chế độ LAN bind `0.0.0.0` và **bắt buộc** token; nếu không thì bind `127.0.0.1`.
- Giới hạn: ≤ 6 dòng; `label`/`value`/`unit` cắt còn 12/10/6 ký tự; body ≤ 8 KB.
- Dòng mờ đi sau ~10s không cập nhật. Chỉ nhận text hiển thị — không thực thi gì.

### Chuỗi thời gian (sparkline)

`POST /series` mỗi lần một điểm số; app giữ ~120 điểm gần nhất theo `label` và vẽ đường mini (tự co giãn, x = thời gian, y = giá trị):

```bash
curl -X POST http://<host>:1337/series \
  -H "Authorization: Bearer <token>" \
  -d '{"label":"ALT","value":12345,"unit":"m"}'
```

### Caption (typewriter)

`POST /text` hiện một dòng text tự do gần đáy, gõ ra kiểu typewriter:

```bash
curl -X POST http://<host>:1337/text \
  -H "Authorization: Bearer <token>" \
  -d '{"text":"RS41 · Y0532363"}'
```

### Thử nhanh bằng script mock

Mô phỏng bóng thám không (lat/lon, sparkline độ cao, khoảng cách, pin, caption tên):

```bash
node scripts/mock-sonde.mjs <token>   # chuyến bay tổng hợp
# phát lại log RS41 thật (đã kèm sẵn):
node scripts/replay-sonde-log.mjs scripts/20260708-115249_Y0532363_RS41_403000_sonde.log <token>
```

Tài liệu đầy đủ: **[docs/vi/sensor-api.md](./docs/vi/sensor-api.md)**.

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
- [Sensor API](./docs/vi/sensor-api.md)
- [Hướng dẫn triển khai](./docs/vi/deployment-guide.md)
- English: [docs/](./docs/)

## Công nghệ

Tauri 2 (Rust) · React 19 + TypeScript + Vite · Canvas2D HUD · Web Audio · Open‑Meteo · ffmpeg bundle.
