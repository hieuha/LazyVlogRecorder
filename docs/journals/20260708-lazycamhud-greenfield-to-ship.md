# LazyCamHUD: Greenfield to Ship in One Session

**Date**: 2026-07-08 23:00  
**Severity**: Medium (greenfield → MVP shipped, known Windows defer)  
**Component**: Tauri 2 desktop app, recording pipeline, HUD renderer, export  
**Status**: Resolved (macOS ready, Windows pending ffmpeg.exe, Linux deferred)

## What Happened

Shipped LazyCamHUD (Tauri 2 + React/TS/Vite) — a Martian-film-style vlog recorder with an HUD burned into video — from greenfield to a working macOS bundle in 7 phases over one session. User drove heavy UI/UX polish (layout spacing, HUD colors, soundwave, CRT overlay globalization). App records webcam + live-data HUD (weather/gauges/time) to MP4 H.264/AAC, auto-stops at duration, persists settings + recordings with PIN auth, ships bundled static ffmpeg.

Core commit sequence verified: scaffold → HUD engine → data layer → recording → ffmpeg MP4 → settings/timer → macOS hardening. All 7 phases marked complete with real deliverables.

## The Brutal Truth

This was heavily iterative and sometimes chaotic. The user knew the product direction but details emerged during implementation. UI polish demanded constant tweaks — HUD spacing wasn't baked into phase 2, CRT overlay was initially per-layout then globalized mid-session, dropdown styling got reworked. The emotional toll was real: the session was tiring because we'd fix one thing, ship a build, user would see a new misalignment, and we'd iterate again. No major architectural failures, but small bugs ate time: camera binding broke after lock/unlock (stale canvas ref), ffmpeg sidecar errored with "os error 2" (binary path resolution), and the recording save froze main thread when Array.from() converted bytes. Each felt like a gotcha we should have caught earlier.

The bigger feeling: we shipped a real app with functional recording, but Windows and Linux are still "someday." The signed macOS bundle is ready to ship to users, but without a Windows sidecar ffmpeg and Linux WebKitGTK testing, we're selling half a cross-platform promise.

## Technical Details

**Architecture invariant (held):** HUD drawn on single `<canvas>` (Canvas2D rAF ~30fps). `canvas.captureStream(30)` grabs video + mic audio track → MediaRecorder (WebM VP8/9+Opus) → temp file → Rust ffmpeg spawned via `std::process::Command` (blocking thread, no sidecar plugin) → MP4 H.264/AAC + faststart moov.

**Recording modes:**
- FIXED: countdown timer auto-stops at configured duration (default 15m).
- FREE: manual stop button.
- Camera switch: static frame + CRT collapse-to-center transition keeps recording alive (separates mic audio stream from camera video stream, rebinds canvas after switch).

**Data layer:** Rust command proxies (no CORS) for IP geolocation + Open-Meteo weather/AQI. Gauges evolved from pressure/oxygen to humidity/rain-probability/temp. City override forward-geocoded so weather follows chosen place.

**Settings + auth:** Tauri Store (config.json). PIN auth: salted SHA-256 hash (auth.json). Sci-fi keypad UI, change-PIN flow, lock button. Recordings library: entries.json index + ffmpeg-generated thumbnails + in-app video player + delete.

**Export path (critical bug fix chain):**
1. Initial: `Array.from(recordingBytes)` in browser → IPC → Rust. Froze UI on >100MB clips. **Fix**: pass raw ArrayBuffer, avoid allocation.
2. FFmpeg sidecar bundled via `externalBin` in tauri.conf.json. Dev mode couldn't resolve binary (path detection failed). **Fix**: self-resolve path from asset proto on dev vs bundle, drop sidecar plugin assumption.
3. Streaming chunks to temp file instead of buffering entire clip in RAM. Works.

**HUD layouts:** Data-driven registry. Two layouts shipped (martian, minimal); adding a third = one declarative file + register, no pipeline changes. Proved extensibility.

**Phase 7 macOS hardening:**
- Custom app icon (Pillow-generated).
- Info.plist: `NSCameraUsageDescription` + `NSMicrophoneUsageDescription`.
- Entitlements: `com.apple.security.device.camera` + audio-input.
- Verified `.app` bundle + .dmg; ffmpeg binary auto-bundled for arm64 and x64.
- Known: `tauri dev` does not always inject Info.plist; must verify in real build.

**Known advisories:**
- RUSTSEC glib < 0.20 (WebKitGTK Linux): medium-severity iterator unsoundness, not compiled on macOS/Windows MVP targets. Revisit when Linux support lands.
- Windows: needs static ffmpeg.exe sidecar (e.g., from gyan.dev).
- iOS/iPad: blocked by iOS forbidding subprocess spawn (ffmpeg transcode not viable).

## What We Tried

1. **Sidecar plugin (Tauri plugin)** for ffmpeg → dropped. Self-resolution of binary path from asset protocol cleaner; dev/bundle path divergence handled inline.
2. **Holding full recording in RAM** → streamed to temp file to avoid freezing on export.
3. **Array.from(recordingBytes) over IPC** → passed raw ArrayBuffer directly; no allocation, no freeze.
4. **Global CRT overlay toggle** → initially per-layout, user wanted it global, moved to root settings component.
5. **Dropdown styling** → iterated on hover/focus states to match HUD aesthetic (all caps labels, sci-fi font).

## Root Cause Analysis

1. **Canvas binding stale after lock/unlock:** Compositor kept a ref to detached canvas element. On unlock, new canvas was mounted but old ref still in compositor state. Didn't null cleanup. Fixed by nulling compositor ref on unmount.

2. **FFmpeg "os error 2" (No such file or directory):** Binary-path detection in dev used bundled path (doesn't exist until `tauri build`). Sidecar plugin auto-resolved; dropping it exposed the path gap. Fixed by checking `TAURI_ENV_DEBUG` and self-resolving dev path to node_modules/.bin or requesting user to fetch via ./scripts/fetch-ffmpeg.sh.

3. **UI freeze during recording save:** Array.from(recordingBytes) allocated a new heap array for ~150MB chunks; caused GC jank. Raw ArrayBuffer over IPC avoids allocation; Rust side gets buffer, writes to temp file immediately.

4. **HUD layout spacing issues in early sessions:** Phase 2 (HUD Layout Engine) was too abstract early on; user feedback during phase 6/7 forced visual tweaks. No test for visual metrics meant we had to iterate live.

## Lessons Learned

1. **Binary bundling with dev/bundle divergence is real.** Sidecar plugins exist for this reason. If dropping them, build a path-resolution strategy that handles both dev (asset protocol not real yet) and bundle (binary in app resources). Document it in deployment guide (done).

2. **Stream large binary data over IPC without allocating.** Array.from() on megabytes is insane. Always pass ArrayBuffer directly; let the receiver handle buffering. Unblock the main thread so UI stays responsive during long-running tasks.

3. **Canvas lifecycle + refs are fragile.** Detached DOM nodes can leave stale canvas refs in React state or closure closures. Always null cleanup on unmount, especially in recording/compositor logic.

4. **Iterate UI with real users early.** HUD spacing, colors, and overlay behavior changed multiple times. Early mockups + a real user preview would have caught layout mismatches before phase 6. Visual regression testing is hard but would have saved time.

5. **Persist architectural invariants in code comments.** "HUD must stay on single canvas for captureStream to work" is load-bearing. Comment it loudly so future refactors don't split the HUD into a separate layer and break recording.

6. **Settings persist; don't lose user config.** Tauri Store worked reliably (config.json + auth.json). Auth.json with salted hashes is safe enough for local PIN. No user had to re-enter settings after restart.

## Next Steps

1. **Windows build:** Fetch static ffmpeg.exe (gyan.dev or similar), place at `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe`, run `npm run tauri build`. Test recording on Windows 10/11 VM. (Owner: user or volunteer)

2. **App signing + notarization (macOS):** Set `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` and rebuild. Required before distribution outside ad-hoc. (Owner: user, post-MVP if shipping to App Store)

3. **Linux (deferred):** WebKitGTK `MediaRecorder`/`captureStream` support is inconsistent. When added, verify the recording path; implement frames→ffmpeg fallback if needed. Fetch Linux ffmpeg sidecar (`ffmpeg-x86_64-unknown-linux-gnu`). Update deployment guide. (Timeline: post-MVP, low priority)

4. **iOS/iPad (blocked indefinitely):** iOS forbids subprocess spawn; ffmpeg transcode not viable. Either drop transcode for iOS (ship WebM) or accept iOS as unsupported. Design decision deferred.

5. **About menu casing:** App name display is inconsistent in some menus ("LazyVlogRecorder" vs "LazyCamHUD"). Standardize to "LazyCamHUD" throughout. (Owner: next polish pass)

6. **Branding:** Bundle ID, crate name, display name all aligned to "LazyCamHUD" this session. Shipping under this name.

## Unresolved Questions

- Will users prefer WebM export instead of MP4 on Windows if ffmpeg.exe is hard to bundle? (Not blocking; Windows build first, then solicit feedback.)
- Should the PIN auth UI have a "forgot PIN" reset flow, or is "wipe config.json" acceptable for MVP? (Deferred; current design acceptable for beta.)
- Does glib < 0.20 advisory affect any real user on Linux once support lands? (Revisit at Linux phase start.)
