# Local RTMP sink — Go Live test harness

Verify the full live path (connect → publish → save-local → error paths) without
FB/YouTube/Twitch. Point the app's Settings → STREAMING at a local sink and play
it back. All commands use the bundled ffmpeg (`src-tauri/binaries/ffmpeg-*`) or a
system ffmpeg/ffplay.

## Option A — one-shot ffmpeg listener (simplest)

```sh
# Terminal 1 — accept ONE publish, remux to a file for inspection:
ffmpeg -y -f flv -listen 1 -i rtmp://127.0.0.1:1935/live/test -c copy /tmp/sink.flv
```

App Settings → STREAMING:
- RTMP URL: `rtmp://127.0.0.1:1935/live`
- STREAM KEY: `test`
- (URL + key compose to `rtmp://127.0.0.1:1935/live/test` in the backend.)

Press GO LIVE. Terminal 1 receives the stream. Then:

```sh
ffplay rtmp://127.0.0.1:1935/live/test   # live view, OR
ffplay /tmp/sink.flv                      # play the captured file after ending
```

Note: `-listen 1` handles a single connection; restart it between takes.

## Option B — mediamtx (robust; multiple readers / reconnects)

```sh
# brew install mediamtx  (or download a single binary)
mediamtx    # listens on rtmp://127.0.0.1:1935/<path>
```

Settings: URL `rtmp://127.0.0.1:1935`, KEY `live/test` (or URL `.../live`, KEY `test`).
Play with `ffplay rtmp://127.0.0.1:1935/live/test`.

## Checks

- [ ] **Happy path (live only):** GO LIVE with "Save copy locally" OFF → badge
      goes CONNECTING… → LIVE; `ffplay` shows canvas + HUD + audio in sync.
- [ ] **Save-local (decoupled):** turn "Save copy locally" ON → on END LIVE a
      `log-*.mp4` is transcoded (PROCESSING overlay) into the output folder and
      indexed in the Library. Verify it plays + faststart:
      `ffprobe -v error -show_entries format=duration -of csv /path/log-*.mp4`.
      The local copy is captured from the raw chunks, NOT the RTMP encode.
- [ ] **Local stays sharp under network lag:** throttle the RTMP reader so the
      badge shows UNSTABLE / drops — the saved local MP4 must still be full,
      smooth, and complete (it never shares the throttled RTMP encode).
- [ ] **Not configured gate:** clear the STREAM KEY → GO LIVE button reads
      "GO LIVE — SET UP" and opens Settings instead of broadcasting.
- [ ] **Kill sink mid-stream:** Ctrl-C the listener → badge → LIVE ERROR, the
      local MP4 (if saving) is transcoded + intact, no zombie ffmpeg
      (`pgrep -fl ffmpeg`).
- [ ] **Backpressure:** throttle the reader (e.g. `mediamtx` + a slow client, or
      `tc`/Network Link Conditioner) → badge → UNSTABLE with a drop count; if it
      stays saturated ~15s while live the stream auto-stops (LIVE ERROR) and
      memory stays flat.
- [ ] **Clamp 720p:** on a machine without a hardware H.264 encoder (software
      `libx264` path) the badge shows `· 720p` and the output is 720p.
- [ ] **No key leak:** watch the app logs / stderr during a full session — the
      stream key must never appear.

## Real-platform smoke (user-run, unlisted)

Use a YouTube/Twitch **unlisted/private** ingest with a real key (paste in
Settings, never commit it). Confirm the platform preview shows A/V in sync, then
end the stream. This is the only step that needs a real key.
