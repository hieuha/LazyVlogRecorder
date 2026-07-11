# Deployment Guide

Build + package **LazyCamHUD** (Tauri 2 + React). MVP targets **macOS + Windows**; Linux is deferred.

## Prerequisites

- Node 20+, Rust stable, Tauri CLI (via `npm run tauri`).
- macOS: Xcode command line tools.
- Windows: WebView2 runtime (bundled by the NSIS installer).

## 1. Fetch the ffmpeg sidecar

The MP4 export uses a bundled static ffmpeg (gitignored). Fetch it for the current host before building:

```bash
# macOS
./scripts/fetch-ffmpeg.sh            # current arch
./scripts/fetch-ffmpeg.sh macos-arm64
./scripts/fetch-ffmpeg.sh macos-x64
```

```powershell
# Windows (fetches a static build from gyan.dev)
powershell -ExecutionPolicy Bypass -File scripts\fetch-ffmpeg.ps1
```

Binaries land in `src-tauri/binaries/ffmpeg-<target-triple>` (Windows: `…-x86_64-pc-windows-msvc.exe`)
and are bundled via `externalBin` in `tauri.conf.json`. At runtime the app resolves
the sidecar with the correct `.exe` suffix per OS (`src-tauri/src/commands/ffmpeg.rs`).

## 2. Build

```bash
npm install
npm run tauri build
```

Outputs:
- macOS: `src-tauri/target/release/bundle/{macos/*.app,dmg/*.dmg}`
- Windows: `src-tauri/target/release/bundle/nsis/*-setup.exe`

## 3. macOS camera/mic permissions

- Usage strings live in `src-tauri/Info.plist` (`NSCameraUsageDescription`,
  `NSMicrophoneUsageDescription`) and are merged into the built app.
- Hardened-runtime entitlements (`src-tauri/entitlements.plist`) grant
  `com.apple.security.device.camera` + `audio-input`, referenced from
  `bundle.macOS.entitlements`. Required once you enable notarization.
- **Dev note:** `tauri dev` does not always merge `Info.plist`; verify the
  camera path from a real `tauri build` bundle.

## 4. Signing / notarization (macOS, for distribution)

Set a signing identity and Apple notarization credentials, then `tauri build`:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: <name> (<team>)"
export APPLE_ID="<apple-id>" APPLE_PASSWORD="<app-specific-pw>" APPLE_TEAM_ID="<team>"
npm run tauri build
```

Unsigned/ad-hoc builds run locally but Gatekeeper will warn on other machines.

## Known advisories

- **RUSTSEC glib < 0.20** (medium, VariantStrIter iterator unsoundness):
  transitive dependency of the **WebKitGTK (Linux)** stack, pinned to 0.18 by
  upstream Tauri Linux deps. Not compiled on macOS/Windows, so it does not
  affect the MVP targets. Revisit when Linux support is added.

## Linux (deferred)

WebKitGTK's MediaRecorder/`captureStream` support is inconsistent. When adding
Linux, verify the recording path and add a frames→ffmpeg fallback if needed
(see `plans/.../phase-07-cross-platform-hardening.md`), and fetch a Linux ffmpeg
sidecar (`ffmpeg-x86_64-unknown-linux-gnu`).
