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

- Log entry name, log number (auto‑increments), city override, FIXED duration, **Record resolution** (720p = smaller files / 1080p = higher quality), **HUD layout** (`Martian` / `Minimal` / `Recon`), **HUD theme** (`Mars Teal` / `Mars Amber` / `Green Hacker`), output folder, **Record audio**, **Mirror camera**, **CRT effect**, and **Change PIN**.
- Layout and theme apply **live** as you pick them — no Save needed (they persist immediately); other settings apply on Save.
- Recording is VP8/WebM at the chosen 16:9 resolution, transcoded to H.264 MP4 (CRF‑26). For smoother recording / smaller files, pick 720p or turn off **CRT effect**.
- **Sensor API** — enable a local HTTP endpoint to push your own sensor readings onto the right side of the HUD (port, LAN access, and bearer token configurable). See the Sensor API section in the README for the request format.

## Library (▤)

- Grid of recordings with thumbnails. **PLAY** opens the in‑app player; **REVEAL** opens the folder; **DELETE** (confirm) removes the file + thumbnail + record.

## Lock (⏻)

- Re‑locks the app to the PIN screen and releases the camera. Enter your PIN to resume.

## Files

- Videos: `~/Movies/LazyCamHUD/` (or your chosen folder) — named `log-<name>-<logNo>-<timestamp>.mp4`.
- Settings/PIN/library: `~/Library/Application Support/com.hatrunghieu.lazycamhud/`.
