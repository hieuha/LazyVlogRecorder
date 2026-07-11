# Deployment Guide

Build + package **LazyCamHUD** (Tauri 2 + React) for **macOS + iOS/iPadOS** (Apple platforms only).

## Prerequisites

### macOS
- Node 20+, Rust stable, Tauri CLI (via `npm run tauri`).
- Xcode command line tools.

### iOS/iPadOS
- Node 20+, Rust stable, Tauri CLI (via `npm run tauri`).
- Xcode (full IDE, not just command-line tools) — required for iOS build & signing.
- CocoaPods (`sudo gem install cocoapods`).
- Rust iOS targets: `rustup target add aarch64-apple-ios aarch64-apple-ios-sim`.
- iOS platform runtime installed in Xcode (Xcode → Settings → Components → add iOS platform).

## 1. Fetch the ffmpeg sidecar (macOS only)

The macOS MP4 export uses a bundled static ffmpeg (gitignored). **iOS does not use ffmpeg**; recording is subprocess-free and native on both platforms.

Fetch ffmpeg for the current macOS host before building:

```bash
./scripts/fetch-ffmpeg.sh            # current arch (arm64 or x86_64)
./scripts/fetch-ffmpeg.sh macos-arm64
./scripts/fetch-ffmpeg.sh macos-x64
```

Binaries land in `src-tauri/binaries/ffmpeg-<target-triple>` and are bundled via `externalBin` in `src-tauri/tauri.macos.conf.json` (macOS-specific overrides). At runtime the app resolves the sidecar with the correct suffix per architecture.

## 2. Build

### macOS

```bash
npm install
npm run tauri build
```

Outputs: `src-tauri/target/release/bundle/{macos/*.app,dmg/*.dmg}`

### iOS/iPadOS

First time only: generate the Xcode project into `src-tauri/gen/apple/`:

```bash
npm install
npm run tauri ios init
```

Build for device or simulator:

```bash
# Device build (must be provisioned in Xcode)
npm run tauri ios build

# Simulator build (arm64 or x86_64; for M1+ use arm64-sim)
npm run tauri ios build -- --target aarch64-sim
```

Outputs:
- Device: `src-tauri/gen/apple/build/release/LazyCamHUD.ipa` (ready for TestFlight / App Store).
- Simulator: `src-tauri/gen/apple/build/arm64-sim/LazyCamHUD.app/` (run in Xcode simulator).

## 3. Permissions & entitlements

### macOS
- Usage strings (`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`) live in `src-tauri/Info.plist`.
- Hardened-runtime entitlements (`src-tauri/entitlements.plist`) grant `com.apple.security.device.camera` + `audio-input`, referenced from `bundle.macOS.entitlements`.
- **Dev note:** `tauri dev` may not always merge `Info.plist`; verify from a real `tauri build` bundle.

### iOS
- **Camera + Microphone:** Usage strings in `src-tauri/gen/apple/lazycamhud_iOS/Info.plist` (`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`). Prompted at first use.
- **Local Network:** `NSLocalNetworkUsageDescription` in the same plist. Required when Sensor API binds to non-loopback addresses (LAN mode). Prompted at first use.
- **Data Protection:** `src-tauri/gen/apple/lazycamhud_iOS/lazycamhud_iOS.entitlements` sets `com.apple.developer.default-data-protection` to `NSFileProtectionComplete`, encrypting app files at rest (when device has a passcode).

## 4. Code signing

### macOS (for distribution)

Set a signing identity and Apple notarization credentials, then build:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: <name> (<team>)"
export APPLE_ID="<apple-id>" APPLE_PASSWORD="<app-specific-pw>" APPLE_TEAM_ID="<team>"
npm run tauri build
```

Unsigned/ad-hoc builds run locally but Gatekeeper will warn on other machines.

### iOS (for device & App Store)

Signing is automatic in Xcode after setting **Team ID** in your development provisioning profile. For CI:

```bash
export APPLE_DEVELOPMENT_TEAM="<team-id>"
npm run tauri ios build
```

A Personal (free) Team works for development. Device must have Developer Mode enabled, and the developer certificate must be trusted in Settings → General → VPN & Device Management.

For App Store distribution, add an App Store Distribution certificate in Xcode and select it in the build settings.

## Storage paths

### macOS
- Videos: `~/Movies/LazyCamHUD/` (user-selectable in Settings).
- Config/PIN/library/thumbnails: `~/Library/Application Support/com.hatrunghieu.lazycamhud/`.

### iOS
- All data (config, PIN, videos, thumbnails): app's Documents sandbox (`/var/mobile/Containers/Data/uscData/com.hatrunghieu.lazycamhud/Documents/`).
- PIN stored in OS Keychain (salt + SHA-256 hash).
- At-rest encryption via iOS Data Protection (when device has a passcode); see entitlements above.
