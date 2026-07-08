# Sensor API — LazyCamHUD

Đẩy dữ liệu cảm biến của bạn vào HUD qua một endpoint HTTP nội bộ. Mọi thứ gửi lên
được vẽ ở góc phải HUD **và burn thẳng vào file MP4** (các panel là widget canvas,
giống các gauge thời tiết).

Ba endpoint:

- `POST /sensors` — số liệu vô hướng (cột `LABEL VALUE unit`, trên‑phải).
- `POST /series` — chuỗi số theo thời gian, vẽ **sparkline** (giữa‑phải).
- `POST /text` — dòng text tự do với hiệu ứng **typewriter** (giữa‑dưới).

## Bật

**Settings → Sensor API → Enable HTTP endpoint.** Rồi cấu hình:

| Cài đặt | Ý nghĩa |
|---|---|
| **Port** | Cổng TCP (mặc định `1337`). |
| **Allow LAN devices** | Bật → bind `0.0.0.0` (thiết bị khác trong mạng gọi được). Tắt → bind `127.0.0.1` (chỉ máy này). |
| **Token** | Bearer token, tự sinh; **Regenerate** để tạo mới. |

Server chạy khi bạn bật + Save, khởi động lại khi đổi cấu hình, và dừng khi khoá app hoặc thoát.

## Xác thực

Gửi token qua header bearer:

```
Authorization: Bearer <token>
```

- **Chế độ LAN bắt buộc** token khác rỗng — mọi request đều bị kiểm.
- Chế độ localhost: token rỗng thì bỏ qua kiểm; có token thì bắt buộc.

## `POST /sensors` — số liệu vô hướng

```bash
curl -X POST http://127.0.0.1:1337/sensors \
  -H "Authorization: Bearer <token>" \
  -d '{"items":[
        {"label":"CO2","value":"812","unit":"ppm"},
        {"label":"HR","value":"78","unit":"bpm"}
      ]}'
```

- Body: `{ "items": [ { "label": string, "value": string, "unit"?: string } ] }`
- Vẽ thành các dòng `LABEL … VALUE unit`, canh phải, góc trên‑phải.
- Lần gửi mới thay toàn bộ set cũ. Dòng **mờ đi sau ~10 giây** không cập nhật.

## `POST /series` — chuỗi thời gian (sparkline)

```bash
curl -X POST http://127.0.0.1:1337/series \
  -H "Authorization: Bearer <token>" \
  -d '{"label":"ALT","value":12345,"unit":"m"}'
```

- Body: `{ "label": string, "value": number, "unit"?: string }` — **mỗi lần một điểm**.
- App giữ **~120 điểm gần nhất theo `label`** và vẽ đường mini: x = thời gian (thứ tự
  mẫu), y = giá trị, tự co giãn theo min/max, có chấm ở điểm cuối. Dòng hiện
  `LABEL <đường> VALUE unit`.
- Cứ POST giá trị hiện tại theo nhịp của bạn; app tự dựng đường cong.

## `POST /text` — caption (typewriter)

```bash
curl -X POST http://127.0.0.1:1337/text \
  -H "Authorization: Bearer <token>" \
  -d '{"text":"RS41 · Y0532363","typing":true}'
```

- Body: `{ "text": string, "typing"?: boolean }` (`typing` mặc định `true`).
- Vẽ canh trái ngay dưới dòng location; ký tự hiện dần ~25/giây kèm con trỏ nhấp nháy.
  Gửi text mới → gõ lại từ đầu. `"typing":false` để hiện tức thì. Cắt còn **120 ký tự**.
- **Idle fallback:** nếu ~12 giây không có caption, chỗ đó hiện dòng hex ngẫu nhiên
  trang trí (vd `0x4F2A 0x9C11 …`) để không bị trống.

## `GET /healthz` — kiểm tra sống

```bash
curl http://127.0.0.1:1337/healthz
# → 200 {"ok":true,"app":"LazyCamHUD","version":"0.4.0"}
```

Không cần token — dùng để xác nhận server tới được (đúng IP/port, firewall) trước
khi đẩy. Lỗi kết nối = API tắt; `200` = đang chạy; `401` khi POST data = đang chạy
nhưng sai token.

## Phản hồi

Mọi phản hồi đều là JSON:

| Status | Body | Khi nào |
|---|---|---|
| `200` | `{"ok":true,"count":N}` (/sensors) · `{"ok":true}` (/series) | thành công |
| `400` | `{"ok":false,"error":"bad json"}` / `"value not finite"` | body sai |
| `401` | `{"ok":false,"error":"unauthorized"}` | thiếu/sai token |
| `413` | `{"ok":false,"error":"too large"}` | body quá lớn |
| `404` | `{"ok":false,"error":"not found"}` | sai method/path |

Thêm `-i` vào `curl` để thấy cả dòng HTTP status.

## Giới hạn

- `/sensors`: ≤ **6 item**; `label`/`value`/`unit` cắt còn **12 / 10 / 6** ký tự.
- `/series`: giữ ≤ **120 điểm** mỗi label (điểm cũ rớt dần).
- `/text`: caption cắt còn **120 ký tự**.
- Body ≤ **8 KB**. Giá trị chỉ là text hiển thị — **không thực thi gì**.

## Script mô phỏng (concept bóng thám không)

Hai script Node không cần dependency (Node 18+) đi kèm để bơm telemetry radiosonde
thực tế vào API — tiện demo và test panel.

### Test nhanh (copy‑paste)

1. Chạy app (`npm run tauri dev`), rồi **Settings → Sensor API → Enable** và copy **token**.
2. Bơm dữ liệu — chuyến bay tổng hợp hoặc log thật:

```bash
# chuyến bay tổng hợp (không cần file dữ liệu)
node scripts/mock-sonde.mjs <token>

# phát lại log auto_rx RS41 thật (ví dụ: nhanh hơn thực + lặp)
SONDE_SPEED=20 SONDE_LOOP=1 \
  node scripts/replay-sonde-log.mjs scripts/20260708-115249_Y0532363_RS41_403000_sonde.log <token>
```

`<token>` là token Sensor API trong Settings. Đường dẫn log là arg đầu tiên (tuyệt đối,
hoặc tương đối so với nơi chạy lệnh). Thêm `SONDE_URL=...` để trỏ máy/cổng khác. Xem
readouts, sparkline và caption typewriter hiện trên HUD (và trong bản ghi).

### `scripts/mock-sonde.mjs` — chuyến bay tổng hợp

Sinh chuyến bay từ đầu: leo ~5 m/s → **nổ ở ~32 km** → rơi dù (nhanh khi cao, chậm
khi thấp), kèm gió trôi ngang và pin tụt dần. Không cần dữ liệu đầu vào.

```bash
node scripts/mock-sonde.mjs <token>                 # → http://127.0.0.1:1337
SONDE_URL=http://192.168.1.20:1337 SONDE_INTERVAL=1000 \
  node scripts/mock-sonde.mjs <token>
```

Đẩy caption tên một lần (`/text` → "MOCK SONDE · HANOI"), rồi mỗi giây:

- `/sensors`: `LAT`, `LON`, `DIST` (km từ điểm phóng), `BATT` (%).
- `/series`: `ALT` (m), `SPD` (tốc độ ngang m/s).

### `scripts/replay-sonde-log.mjs` — phát lại log thật

Phát lại một file CSV [auto_rx](https://github.com/projecthorus/radiosonde_auto_rx)
thật (vd RS41) theo từng dòng, đúng nhịp thời gian trong log. Có sẵn log mẫu ở
`scripts/20260708-115249_Y0532363_RS41_403000_sonde.log`.

Header mong đợi:
`timestamp,serial,frame,lat,lon,alt,vel_v,vel_h,heading,temp,humidity,pressure,type,freq_mhz,snr,f_error_hz,sats,batt_v,burst_timer,aux_data`

```bash
node scripts/replay-sonde-log.mjs <logfile> <token>          # thời gian thật (1 Hz)
SONDE_SPEED=20 node scripts/replay-sonde-log.mjs <logfile> <token>   # nhanh 20×
SONDE_LOOP=1  node scripts/replay-sonde-log.mjs <logfile> <token>    # lặp lại
```

Đẩy tên sonde một lần (`/text` → `<type> · <serial>`, vd "RS41 · Y0532363"), rồi mỗi dòng:

- `/sensors`: `LAT`, `LON`, `DIST` (từ dòng đầu = điểm phóng), `TEMP` (`--` cho tới
  khi cần cảm biến RS41 bung, tức khi `temp` = `-273`), `BATT` (V), `SATS`.
- `/series`: `ALT` (m), `CLIMB` (`vel_v`, m/s).

**Biến môi trường:** `SONDE_TOKEN`, `SONDE_URL`, `SONDE_INTERVAL` (mock), `SONDE_SPEED`
(hệ số tua khi replay), `SONDE_LOOP=1` (replay).

## Lưu ý bảo mật

- Endpoint chỉ nhận **text hiển thị**; không có đường nào thực thi nó.
- Kích thước/số lượng/độ dài đều bị clamp để thiết bị không làm tràn HUD hay bộ nhớ.
- Bind LAN **bắt buộc** token — server từ chối khởi động trên `0.0.0.0` nếu không có — và token được so sánh theo thời gian hằng số. Coi token như mật khẩu chung trong mạng.
- Token lưu trong `config.json` cùng các cài đặt khác (không phải secret store).
