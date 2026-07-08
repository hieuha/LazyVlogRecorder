# Hướng dẫn sử dụng — LazyCamHUD

## Lần đầu mở

1. Đặt **PIN 4 số** (nhập rồi xác nhận). Mỗi lần mở app sẽ nhập lại.
2. Cấp quyền **camera + microphone** khi được hỏi.

## Quay

- **Chế độ:** chuyển `FIXED` (tự dừng sau `MIN` phút) hoặc `FREE` (dừng thủ công).
- **Record / Stop:** bấm `● REC` / `■ STOP`, hoặc nhấn **Space**.
- **Pause / Resume:** `❚❚ PAUSE` / `▶ RESUME` khi đang quay (thời gian pause bị trừ khỏi đồng hồ và khỏi auto‑stop của FIXED).
- **Đổi camera khi đang quay:** chọn camera khác ở dropdown — recording vẫn tiếp tục; một đoạn nhiễu + thu tròn được chèn vào. (Không đổi mic khi đang quay.)
- Sau khi stop, overlay **PROCESSING** giữa màn hình hiện tiến trình transcode; MP4 vào thư mục lưu và có toast `SAVED ▸ dung lượng`.

## HUD

- Gauge: **Humidity**, **Rain** (khả năng mưa giờ hiện tại), **Temp**; kèm **Environment**, **HAB > CAMERA**, ngày **MISSION DAY**, **TIME**, **LOG ENTRY**, và **soundwave mic** trực tiếp.
- Vị trí + thời tiết theo IP; đặt **City override** trong Settings để ghim một nơi (thời tiết theo nơi đó).

## Controls (góc dưới phải)

- **▤ Library** · **⚙ Settings** · dropdown **Camera** / **Mic** · **⏻ Lock**.

## Settings (⚙)

- Tên log entry, số log (tự tăng), city override, thời lượng FIXED, HUD layout (`Martian` / `Minimal`), thư mục lưu, **Record audio**, **Mirror camera**, **CRT effect**, và **Change PIN**.

## Library (▤)

- Lưới các bản quay kèm thumbnail. **PLAY** mở player trong app; **REVEAL** mở thư mục; **DELETE** (xác nhận) xoá file + thumbnail + record.

## Lock (⏻)

- Khoá lại app về màn PIN và nhả camera. Nhập PIN để tiếp tục.

## File

- Video: `~/Movies/LazyCamHUD/` (hoặc thư mục bạn chọn) — tên `log-<tên>-<logNo>-<timestamp>.mp4`.
- Settings/PIN/library: `~/Library/Application Support/com.harry.lazycamhud/`.
