# Hướng dẫn triển khai — LazyCamHUD

Build + đóng gói **LazyCamHUD** (Tauri 2 + React). MVP nhắm **macOS + Windows**; Linux hoãn sau.

## Yêu cầu

- Node 20+, Rust stable, Tauri CLI (qua `npm run tauri`).
- macOS: Xcode command line tools.
- Windows: WebView2 runtime (kèm trong bộ cài NSIS).

## 1. Tải ffmpeg sidecar

Xuất MP4 dùng ffmpeg static bundle (git‑ignore). Tải cho máy hiện tại trước khi build:

```bash
# macOS
./scripts/fetch-ffmpeg.sh            # theo arch hiện tại
./scripts/fetch-ffmpeg.sh macos-arm64
./scripts/fetch-ffmpeg.sh macos-x64
```

```powershell
# Windows (tải static build từ gyan.dev)
powershell -ExecutionPolicy Bypass -File scripts\fetch-ffmpeg.ps1
```

Binary vào `src-tauri/binaries/ffmpeg-<target-triple>` (Windows: `…-x86_64-pc-windows-msvc.exe`), được bundle qua `externalBin` trong `tauri.conf.json`. Lúc chạy, app tự tìm sidecar với đuôi `.exe` đúng theo OS (`src-tauri/src/commands/ffmpeg.rs`).

## 2. Build

```bash
npm install
npm run tauri build
```

Kết quả:
- macOS: `src-tauri/target/release/bundle/{macos/*.app,dmg/*.dmg}`
- Windows: `src-tauri/target/release/bundle/nsis/*-setup.exe`

## 3. Quyền camera/mic macOS

- Chuỗi mô tả quyền nằm ở `src-tauri/Info.plist` (`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`), được gộp vào app khi build.
- Entitlements hardened‑runtime (`src-tauri/entitlements.plist`) cấp `com.apple.security.device.camera` + `audio-input`, trỏ từ `bundle.macOS.entitlements`. Cần khi bật notarization.
- **Lưu ý dev:** `tauri dev` không phải lúc nào cũng gộp `Info.plist`; hãy kiểm tra camera từ bản `tauri build` thật.

## 4. Ký / notarize (macOS, để phân phối)

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: <name> (<team>)"
export APPLE_ID="<apple-id>" APPLE_PASSWORD="<app-specific-pw>" APPLE_TEAM_ID="<team>"
npm run tauri build
```

Bản chưa ký/ad‑hoc chạy được ở máy local nhưng Gatekeeper cảnh báo trên máy khác.

## Cảnh báo đã biết

- **RUSTSEC glib < 0.20** (medium, unsoundness iterator `VariantStrIter`): dep transitive của stack **WebKitGTK (Linux)**, bị pin 0.18 bởi dep Linux của Tauri. Không compile trên macOS/Windows nên **không ảnh hưởng** MVP mac/win. Xem lại khi thêm Linux.

## Linux (hoãn)

`MediaRecorder`/`captureStream` của WebKitGTK hỗ trợ không đồng đều. Khi thêm Linux, kiểm tra đường ghi và thêm fallback frames→ffmpeg nếu cần, và tải ffmpeg Linux (`ffmpeg-x86_64-unknown-linux-gnu`).
