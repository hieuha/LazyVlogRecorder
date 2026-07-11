# Usage Guide — LazyCamHUD

## First launch

1. Set a **4‑digit PIN** (enter, then confirm). You'll enter it each launch.
2. Grant **camera + microphone** permission when prompted.

## Recording

- **Mode:** toggle FIXED (auto‑stop after MIN minutes) or FREE (manual stop).
- **Record / Stop:** click `● REC` / `■ STOP`, or press **Space** (macOS only; iOS uses on-screen buttons).
- **Pause / Resume:** `❚❚ PAUSE` / `▶ RESUME` while recording (paused time is excluded from the timer and from the FIXED auto‑stop).
- **Switch camera while recording:** (macOS only) press **1**–**4** (maps to the 1st–4th camera in the dropdown) — recording continues; a short static + collapse transition is baked in. iOS: tap another camera in the dropdown. Mic can't be changed while recording.
- After stop, a brief **PROCESSING** overlay shows progress (usually near-instant for native H.264/AAC MP4 remux); the file lands in your output folder and a `SAVED ▸ size · filename` pill appears (click it to reveal in folder).

## HUD

- Gauges: **Humidity**, **Rain** (current‑hour chance), **Temp**; plus **Environment**, **HAB > CAMERA**, **MISSION DAY** date, **TIME**, **LOG ENTRY**, and a live **mic soundwave**.
- **Ship Vitals** (opt‑in): battery % (on supported machines), CPU %, RAM %, machine uptime (HH:MM, or Dd HH:MM past 24h), displayed as a compact strip in the bottom‑right corner. Enable in Settings → **SHIP VITALS**.
- Location + weather follow your IP; set **City override** in Settings to pin a place (weather follows it).

## Control bar (below the video)

All buttons live in a black bar under the video (nothing overlays the camera). Recording controls (mode, MIN, `● REC`) sit on the left; on the right: **▤ Library** · **⚙ Settings** · **Camera** / **Mic** dropdowns · **⏻ Lock**.

## Settings (⚙)

- Log entry name, log number (auto‑increments), city override, **MISSION DAY** (leave blank for auto Y.M.D date; custom text auto‑sizes the panel), FIXED duration, **Record resolution** (720p = smaller files / 1080p = higher quality), **HUD layout** (Martian / Minimal / Recon), **HUD theme** (Teal / Amber / Green / Crypt), **Ship Vitals** (CPU, RAM, uptime; battery on macOS only), **Record audio**, **Mirror camera**, **CRT effect**, and **Change PIN**.
- On macOS: output folder (default: `~/Movies/LazyCamHUD/`). On iOS: recordings go to the app's Documents sandbox (no folder picker).
- Layout and theme apply **live** as you pick them — no Save needed (they persist immediately); other settings apply on Save.
- Recording uses native H.264/AAC MP4 (subprocess-free on both platforms) at the chosen 16:9 resolution. For smoother recording / smaller files, pick 720p or turn off **CRT effect**.
- **Streaming settings (Streaming tab, macOS only):** FPS (default 30) and video bitrate (default 4500k); stream resolution follows the record resolution. Constant bitrate for smooth RTMP. Advisory hints warn if your **Go-Live URL** doesn't start with `rtmp://` or `rtmps://`, or looks like it already contains the stream key (which the app appends — a key in the URL would be doubled and cause ffmpeg 404 errors). Hidden on iOS.
- **API Service** — enable a local HTTP endpoint to push your own sensor readings onto the right side of the HUD. **Bind Host** dropdown lists 127.0.0.1 (this device only), 0.0.0.0 (all interfaces/LAN), and any detected LAN IPs. Binding to anything other than loopback **requires a token**. Enabling/disabling and regenerating the token show a confirmation dialog. **Regenerate token** persists and restarts the service immediately (no Save needed). On iOS, the service is foreground-only and auto-resumes when the app returns to foreground; the NSLocalNetworkUsageDescription permission is requested on first LAN access. See the Sensor API section in the README for the request format.

## Library (▤)

- Grid of recordings with thumbnails. **PLAY** opens the in‑app player; **REVEAL** opens the folder; **DELETE** (confirm) removes the file + thumbnail + record.

## Lock (⏻)

- Re‑locks the app to the PIN screen and releases the camera. Enter your PIN to resume.

## Keyboard shortcuts (macOS only)

| Key | Action |
|-----|--------|
| **Space** | Start / stop local recording (mid-recording shortcuts excluded in Settings inputs) |
| **1** | Switch to camera 1 (same order as camera dropdown; works mid-recording) |
| **2** | Switch to camera 2 |
| **3** | Switch to camera 3 |
| **4** | Switch to camera 4 |

iOS uses on-screen buttons and tap-to-switch for all controls.

## Files

### macOS
- Videos: `~/Movies/LazyCamHUD/` (or your chosen folder) — named `log-<name>-<logNo>-<timestamp>.mp4`.
- Config/PIN/library: `~/Library/Application Support/com.hatrunghieu.lazycamhud/`.

### iOS
- All data: app's Documents sandbox. No manual file access needed; use the Library view to play, delete, or reveal in Files app (if visible).
- PIN stored in OS Keychain (salt + SHA-256 hash).
- Videos/thumbnails encrypted at rest via Data Protection (when device has a passcode).
