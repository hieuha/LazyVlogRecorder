# Hướng dẫn sử dụng — LazyCamHUD

## Lần đầu mở

1. Đặt **PIN 4 số** (nhập rồi xác nhận). Mỗi lần mở app sẽ nhập lại.
2. Cấp quyền **camera + microphone** khi được hỏi.

## Quay

- **Chế độ:** chuyển `FIXED` (tự dừng sau `MIN` phút) hoặc `FREE` (dừng thủ công).
- **Record / Stop:** bấm `● REC` / `■ STOP`, hoặc nhấn **Space**.
- **Pause / Resume:** `❚❚ PAUSE` / `▶ RESUME` khi đang quay (thời gian pause bị trừ khỏi đồng hồ và khỏi auto‑stop của FIXED).
- **Đổi camera khi đang quay:** chọn camera khác ở dropdown — recording vẫn tiếp tục; một đoạn nhiễu + thu tròn được chèn vào. (Không đổi mic khi đang quay.)
- Sau khi stop, overlay **PROCESSING** giữa màn hình hiện tiến trình transcode; MP4 vào thư mục lưu và hiện pill `SAVED ▸ dung lượng · tên file` ngay cạnh `● REC` trong thanh điều khiển (bấm để mở thư mục).

## HUD

- Gauge: **Humidity**, **Rain** (khả năng mưa giờ hiện tại), **Temp**; kèm **Environment**, **HAB > CAMERA**, ngày **MISSION DAY**, **TIME**, **LOG ENTRY**, và **soundwave mic** trực tiếp.
- **Ship Vitals** (tuỳ chọn): % pin (trên máy hỗ trợ), CPU %, RAM %, uptime máy (HH:MM, hoặc Dd HH:MM nếu quá 24h), hiển thị dạng strip nhỏ góc dưới-phải. Bật trong Settings → **SHIP VITALS**.
- Vị trí + thời tiết theo IP; đặt **City override** trong Settings để ghim một nơi (thời tiết theo nơi đó).

## Thanh điều khiển (bên dưới video)

Tất cả nút nằm trong thanh đen dưới video (không đè lên camera). Nút quay (chế độ, `MIN`, `● REC`) ở bên trái; bên phải: **▤ Library** · **⚙ Settings** · dropdown **Camera** / **Mic** · **⏻ Lock**.

## Settings (⚙)

- Tên log entry, số log (tự tăng), city override, **MISSION DAY** (để trống = auto Y.M.D; text tuỳ chỉnh tự co dãn panel), thời lượng FIXED, **Record resolution** (720p = file nhỏ / 1080p = chất lượng cao), **HUD layout** (`Martian` / `Minimal` / `Recon`), **HUD theme** (`Teal` / `Amber` / `Green` / `Crypt`), **Ship Vitals** (strip pin, CPU, RAM, uptime), thư mục lưu (mặc định: `Movies/LazyCamHUD`), **Record audio**, **Mirror camera**, **CRT effect**, và **Change PIN**.
- Layout và theme áp **live** ngay khi chọn — không cần Save (lưu tức thì); các cài đặt khác áp khi Save.
- Quay ở VP8/WebM theo độ phân giải 16:9 đã chọn, rồi transcode sang H.264 MP4 (CRF‑26). Muốn quay mượt hơn / file nhỏ hơn: chọn 720p hoặc tắt **CRT effect**.
- **API Service** — bật endpoint HTTP nội bộ để đẩy dữ liệu cảm biến lên góc phải HUD. Bật/tắt service và tạo lại token hiện dialog xác nhận. **Regenerate token** lưu và khởi động lại service tức thì (không cần Save). Port và cho phép LAN đều chỉnh được. Xem mục Sensor API trong README để biết định dạng request.

## Library (▤)

- Lưới các bản quay kèm thumbnail. **PLAY** mở player trong app; **REVEAL** mở thư mục; **DELETE** (xác nhận) xoá file + thumbnail + record.

## Lock (⏻)

- Khoá lại app về màn PIN và nhả camera. Nhập PIN để tiếp tục.

## File

- Video: `~/Movies/LazyCamHUD/` (hoặc thư mục bạn chọn) — tên `log-<tên>-<logNo>-<timestamp>.mp4`.
- Settings/PIN/library: `~/Library/Application Support/com.hatrunghieu.lazycamhud/`.
