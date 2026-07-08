# Usage Guide — LazyCamHUD

## First launch

1. Set a **4‑digit PIN** (enter, then confirm). You'll enter it each launch.
2. Grant **camera + microphone** permission when prompted.

## Recording

- **Mode:** toggle `FIXED` (auto‑stop after `MIN` minutes) or `FREE` (manual stop).
- **Record / Stop:** click `● REC` / `■ STOP`, or press **Space**.
- **Pause / Resume:** `❚❚ PAUSE` / `▶ RESUME` while recording (paused time is excluded from the timer and from the FIXED auto‑stop).
- **Switch camera while recording:** pick another camera in the dropdown — recording continues; a short static + collapse transition is baked in. (Mic can't be changed while recording.)
- After stop, a centered **PROCESSING** overlay shows transcode progress; the MP4 lands in your output folder and a `SAVED ▸ size · filename` pill appears next to `● REC` in the control bar (click it to reveal in folder).

## HUD

- Gauges: **Humidity**, **Rain** (current‑hour chance), **Temp**; plus **Environment**, **HAB > CAMERA**, **MISSION DAY** date, **TIME**, **LOG ENTRY**, and a live **mic soundwave**.
- Location + weather follow your IP; set **City override** in Settings to pin a place (weather follows it).

## Control bar (below the video)

All buttons live in a black bar under the video (nothing overlays the camera). Recording controls (mode, `MIN`, `● REC`) sit on the left; on the right: **▤ Library** · **⚙ Settings** · **Camera** / **Mic** dropdowns · **⏻ Lock**.

## Settings (⚙)

- Log entry name, log number (auto‑increments), city override, FIXED duration, HUD layout (`Martian` / `Minimal`), output folder, **Record audio**, **Mirror camera**, **CRT effect**, and **Change PIN**.

## Library (▤)

- Grid of recordings with thumbnails. **PLAY** opens the in‑app player; **REVEAL** opens the folder; **DELETE** (confirm) removes the file + thumbnail + record.

## Lock (⏻)

- Re‑locks the app to the PIN screen and releases the camera. Enter your PIN to resume.

## Files

- Videos: `~/Movies/LazyCamHUD/` (or your chosen folder) — named `log-<name>-<logNo>-<timestamp>.mp4`.
- Settings/PIN/library: `~/Library/Application Support/com.hatrunghieu.lazycamhud/`.
