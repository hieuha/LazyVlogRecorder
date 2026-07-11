# Usage Guide — LazyCamHUD

## First launch

1. Set a **4‑digit PIN** (enter, then confirm). You'll enter it each launch.
2. Grant **camera + microphone** permission when prompted.

## Recording

- **Mode:** toggle `FIXED` (auto‑stop after `MIN` minutes) or `FREE` (manual stop).
- **Record / Stop:** click `● REC` / `■ STOP`, or press **Space**.
- **Pause / Resume:** `❚❚ PAUSE` / `▶ RESUME` while recording (paused time is excluded from the timer and from the FIXED auto‑stop).
- **Switch camera while recording:** press **1**–**4** (maps to the 1st–4th camera in the dropdown, in the same order) — recording continues; a short static + collapse transition is baked in. Or pick another camera in the dropdown. (Mic can't be changed while recording.)
- After stop, a brief **PROCESSING** overlay shows progress (usually near-instant for hardware H.264 remux, or longer for transcode); the MP4 lands in your output folder and a `SAVED ▸ size · filename` pill appears next to `● REC` in the control bar (click it to reveal in folder).

## HUD

- Gauges: **Humidity**, **Rain** (current‑hour chance), **Temp**; plus **Environment**, **HAB > CAMERA**, **MISSION DAY** date, **TIME**, **LOG ENTRY**, and a live **mic soundwave**.
- **Ship Vitals** (opt‑in): battery % (on supported machines), CPU %, RAM %, machine uptime (HH:MM, or Dd HH:MM past 24h), displayed as a compact strip in the bottom‑right corner. Enable in Settings → **SHIP VITALS**.
- Location + weather follow your IP; set **City override** in Settings to pin a place (weather follows it).

## Control bar (below the video)

All buttons live in a black bar under the video (nothing overlays the camera). Recording controls (mode, `MIN`, `● REC`) sit on the left; on the right: **▤ Library** · **⚙ Settings** · **Camera** / **Mic** dropdowns · **⏻ Lock**.

## Settings (⚙)

- Log entry name, log number (auto‑increments), city override, **MISSION DAY** (leave blank for auto Y.M.D date; custom text auto‑sizes the panel), FIXED duration, **Record resolution** (720p = smaller files / 1080p = higher quality), **HUD layout** (`Martian` / `Minimal` / `Recon`), **HUD theme** (`Teal` / `Amber` / `Green` / `Crypt`), **Ship Vitals** (battery, CPU, RAM, uptime strip), output folder (default: `Movies/LazyCamHUD`), **Record audio**, **Mirror camera**, **CRT effect**, and **Change PIN**.
- Layout and theme apply **live** as you pick them — no Save needed (they persist immediately); other settings apply on Save.
- Recording prefers hardware H.264 (fast remux to MP4) when available; falls back to VP8/WebM transcode to H.264 (CRF‑26) on older browsers or with software encoding. Both at the chosen 16:9 resolution. For smoother recording / smaller files, pick 720p or turn off **CRT effect**.
- **Streaming settings (Streaming tab):** FPS (default 30) and video bitrate (default 4500k); stream resolution now follows the record resolution (no separate stream height, since hardware remux cannot downscale). Constant bitrate for smooth RTMP. Software-encoder machines clamp to 720p. An advisory hint warns if your **Go-Live URL** doesn't start with `rtmp://` or `rtmps://`, or if it looks like it already contains the stream key (which the app appends for you — a key in the URL would be doubled and cause ffmpeg 404 errors).
- **API Service** — enable a local HTTP endpoint to push your own sensor readings onto the right side of the HUD. Enabling/disabling and regenerating the token show a confirmation dialog first. **Regenerate token** persists and restarts the service immediately (no Save needed). Port and LAN access are configurable. See the Sensor API section in the README for the request format.

## Library (▤)

- Grid of recordings with thumbnails. **PLAY** opens the in‑app player; **REVEAL** opens the folder; **DELETE** (confirm) removes the file + thumbnail + record.

## Lock (⏻)

- Re‑locks the app to the PIN screen and releases the camera. Enter your PIN to resume.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| **Space** | Start / stop local recording (mid-recording shortcuts excluded in Settings inputs) |
| **1** | Switch to camera 1 (same order as camera dropdown; works mid-recording) |
| **2** | Switch to camera 2 |
| **3** | Switch to camera 3 |
| **4** | Switch to camera 4 |

## Files

- Videos: `~/Movies/LazyCamHUD/` (or your chosen folder) — named `log-<name>-<logNo>-<timestamp>.mp4`.
- Settings/PIN/library: `~/Library/Application Support/com.hatrunghieu.lazycamhud/`.
