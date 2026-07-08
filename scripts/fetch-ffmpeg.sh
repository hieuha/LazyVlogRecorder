#!/usr/bin/env bash
# Fetch static ffmpeg binaries into src-tauri/binaries/ as Tauri sidecars named
# ffmpeg-<target-triple>. Static builds from ffmpeg.martin-riedl.de (macOS) and
# gyan.dev (Windows). Run before `tauri build`; the binaries are gitignored.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/binaries"
mkdir -p "$DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fetch_macos() {
  local arch="$1" triple="$2"
  echo "→ macOS $arch ($triple)"
  curl -sL --max-time 180 -o "$TMP/ffmpeg.zip" \
    "https://ffmpeg.martin-riedl.de/redirect/latest/macos/$arch/release/ffmpeg.zip"
  unzip -o "$TMP/ffmpeg.zip" -d "$TMP" >/dev/null
  mv "$TMP/ffmpeg" "$DIR/ffmpeg-$triple"
  chmod +x "$DIR/ffmpeg-$triple"
}

case "${1:-current}" in
  current)
    if [ "$(uname -s)" = "Darwin" ]; then
      [ "$(uname -m)" = "arm64" ] && fetch_macos arm64 aarch64-apple-darwin \
                                  || fetch_macos amd64 x86_64-apple-darwin
    else
      echo "Only macOS auto-fetch is wired here; add Windows/Linux as needed."
      exit 1
    fi
    ;;
  macos-arm64) fetch_macos arm64 aarch64-apple-darwin ;;
  macos-x64)   fetch_macos amd64 x86_64-apple-darwin ;;
  *) echo "usage: fetch-ffmpeg.sh [current|macos-arm64|macos-x64]"; exit 1 ;;
esac

echo "Done. Binaries in $DIR"
