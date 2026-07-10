# Spike — MediaRecorder H.264 / GOP + ffmpeg matrix (Go Live feasibility)

Purpose: measure the unknowns that decide the streaming encode strategy **before**
building the backend. Throwaway/dev-only — no spike code stays in production paths.

## Spike A — MediaRecorder H.264 support + GOP (WKWebView, macOS)

Decides `-c:v copy` (pass MediaRecorder output straight to RTMP) vs re-encode.

Run in the dev app console (`npm run tauri dev`):

```js
MediaRecorder.isTypeSupported("video/mp4;codecs=h264")   // → keep result
MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") // baseline (used today)
```

If H.264 is supported, record ~10s of the canvas to a Blob, save it, then measure
the keyframe interval with the bundled ffprobe:

```sh
ffprobe -show_frames -select_streams v -of csv spike.mp4 \
  | awk -F, '/^frame/{n++} /key_frame=1/{k++} END{print "frames="n" keyframes="k" avg_gop="n/k}'
```

**Copy-path gate:** use `-c:v copy` only if avg GOP ≤ ~4s (≤120 frames @30fps)
**and** the interval is even. Otherwise re-encode.

### Result (2026-07-10)

Not measured on a live WKWebView here. Per plan Validation Session 1 (decision 4),
the GOP spike is **inconclusive by policy** — WKWebView MediaRecorder keyframe
cadence is not controllable via the standard API, so a stable copy-path cannot be
guaranteed. **Decision: MVP re-encode only.** `build_ffmpeg_stream_args` still
carries an `encode_mode` param, but the caller always passes `ReEncode` for the
MVP; `-c copy` is deferred to the roadmap until a measured, stable GOP exists.

## Spike B — ffmpeg encoder / protocol matrix

### macOS (bundled `binaries/ffmpeg-aarch64-apple-darwin`) — VERIFIED 2026-07-10

```sh
ffmpeg -hide_banner -encoders  | grep -iE "h264|aac"
ffmpeg -hide_banner -protocols | grep -iE "rtmp|tls"
ffmpeg -hide_banner -muxers    | grep -iE " tee| flv| mp4"
```

- Video encoders: `h264_videotoolbox` (HW) ✅, `libx264` (SW fallback) ✅, `libopenh264`.
- Audio: `aac` ✅.
- Protocols: `rtmp`, `rtmps`, `tls` ✅ (rtmpe/rtmpt/rtmpts also present).
- Muxers: `flv` ✅, `mp4` ✅, `tee` ✅.

macOS path is fully covered: HW encode + rtmps + tee → live + local MP4.

### Windows — NOT VERIFIED

No Windows box available. Per decision 3 (ship mac-first): code the Windows path
by `cfg!(windows)` (`h264_mf`, else `libx264 -preset veryfast` + clamp 720p) but
mark **"Windows not verified"**. To verify later, on a Windows box:

```powershell
ffmpeg -hide_banner -encoders  | findstr /I "h264"   # expect h264_mf / nvenc / qsv
ffmpeg -hide_banner -protocols | findstr /I "rtmp"
```

## Spike C — local RTMP sink (dev, no FB/YT needed)

See `scripts/local-rtmp-sink.md` (Phase 6 harness) for the runnable version.
Quick form — one-shot ffmpeg listener + ffplay:

```sh
# Terminal 1: accept one RTMP publish and remux to a file
ffmpeg -y -f flv -listen 1 -i rtmp://127.0.0.1:1935/live/test -c copy /tmp/sink.flv
# Terminal 2 (after the app streams to rtmp://127.0.0.1:1935/live/test):
ffplay rtmp://127.0.0.1:1935/live/test    # or play /tmp/sink.flv
```

`mediamtx` (single binary) is the more robust alternative when re-publishing /
multiple readers are needed.

## Decisions carried into Phase 2

1. **Encode mode:** re-encode only for MVP (`h264_videotoolbox` on mac, `-b:v`
   per resolution). Copy-path deferred.
2. **Bitrate:** 720p → 4500k, 1080p → 6000k.
3. **HW clamp:** if no HW encoder, clamp height to 720 + surface a warning.
4. **Windows:** mac-first; Windows path coded but unverified.
