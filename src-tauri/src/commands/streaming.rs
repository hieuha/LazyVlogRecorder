// Go Live — RTMP(S) streaming backend.
//
// One long-lived ffmpeg reads WebM (canvas + mic, same chunk stream the local
// recorder produces) from stdin, re-encodes to H.264/AAC, and publishes to a
// generic RTMP(S) endpoint (FB/YouTube/Twitch). When "save copy locally" is on,
// a `tee` muxer writes a fragmented MP4 alongside (onfail=ignore, so a network
// drop never loses the local take).
//
// Only one session runs at a time. Chunks flow through a bounded channel to a
// writer thread: if the network can't keep up, stdin backpressures, the buffer
// fills, and we drop + auto-stop instead of growing memory without bound.
//
// Secret handling: the composed RTMP URL contains the stream key. It lives only
// inside the ffmpeg argv — it is never logged, and stderr is parsed locally into
// structured status events (never forwarded verbatim), so the key cannot leak.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use super::ffmpeg::ffmpeg_path;

// Bounded chunk queue. At the live timeslice (~500ms/chunk) this is ~8s of
// buffering before chunks start dropping — generous enough to ride out normal
// network jitter and the RTMP/TLS handshake, still bounded so memory stays flat.
const CHUNK_BUFFER: usize = 16;
// How long the buffer may stay saturated (while live) before we give up and stop.
// Only counted once the stream is actually live, so a slow connect can't trip it.
const OVERFLOW_GRACE: Duration = Duration::from_secs(15);
// Grace for ffmpeg to finalize + exit after stdin closes (clean stop), before we
// escalate to a signal.
const STOP_TIMEOUT: Duration = Duration::from_secs(5);
// Grace after SIGTERM (ffmpeg writing the MP4 trailer) before the last-resort kill.
const TERM_GRACE: Duration = Duration::from_secs(3);

/// Re-encode (MVP) vs stream-copy (roadmap; only valid when the source GOP is
/// known-stable). The builder handles both; the MVP caller always re-encodes.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EncodeMode {
    // Re-encode VP8 (from MediaRecorder) → H.264. Used when the webview can't
    // produce H.264 directly.
    ReEncode,
    // Stream-copy: the webview already produced H.264 (hardware), so ffmpeg just
    // remuxes to FLV — no decode/encode. Resolution/bitrate come from the
    // recorder, so scale/bitrate args don't apply.
    Copy,
}

/// Inputs to the pure ffmpeg-arg builder. `rtmp_url` is already the full publish
/// URL (base + stream key composed by the caller). This ffmpeg is RTMP-only —
/// the optional local MP4 is captured separately by the frontend (raw chunks →
/// temp file → transcode on stop), so a laggy network never degrades the local
/// take and the two never share one throttled encode.
#[derive(Clone, Debug)]
pub struct StreamArgs {
    pub rtmp_url: String,
    pub height: u32,        // 720 | 1080 (already clamped by caller)
    pub fps: u32,           // output frame rate
    pub bitrate_kbps: u32,  // CBR video bitrate (match the uplink)
    pub encode_mode: EncodeMode,
    pub video_encoder: String, // "h264_videotoolbox" | "h264_mf" | "libx264"
}

/// Build the ffmpeg argv for a live session. Pure function — no I/O, no spawn —
/// so it is exhaustively unit-tested. Reads WebM from stdin, publishes FLV over
/// RTMP(S), optionally tees a fragmented MP4 to disk.
pub fn build_ffmpeg_stream_args(a: &StreamArgs) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();
    let s = |v: &str| v.to_string();

    // Input: low-latency read of the piped stream.
    args.extend([s("-hide_banner"), s("-loglevel"), s("error")]);
    // Regenerate PTS only when re-encoding. On the copy path the MediaRecorder
    // timestamps are valid — rewriting them jitters frame spacing on RTMP.
    if a.encode_mode == EncodeMode::ReEncode {
        args.extend([s("-fflags"), s("+genpts")]);
    }
    args.extend([s("-i"), s("pipe:0")]);

    // Deterministic stream selection (audio optional).
    args.extend([s("-map"), s("0:v:0"), s("-map"), s("0:a:0?")]);

    // Video.
    match a.encode_mode {
        EncodeMode::Copy => args.extend([s("-c:v"), s("copy")]),
        EncodeMode::ReEncode => {
            let bitrate = format!("{}k", a.bitrate_kbps);
            let bufsize = format!("{}k", a.bitrate_kbps * 2);
            let gop = (a.fps * 2).to_string();
            args.extend([s("-c:v"), a.video_encoder.clone()]);
            match a.video_encoder.as_str() {
                // Hardware: low-latency realtime mode for smooth live output.
                "h264_videotoolbox" => args.extend([s("-realtime"), s("1")]),
                // Software: fastest preset + zero-latency tune to keep up live.
                "libx264" => {
                    args.extend([s("-preset"), s("veryfast"), s("-tune"), s("zerolatency")])
                }
                _ => {}
            }
            // CBR-ish (b = maxrate, 2s buffer): steady bitrate is what streaming
            // platforms want and what keeps the feed from stuttering.
            args.extend([s("-b:v"), bitrate.clone(), s("-maxrate"), bitrate, s("-bufsize"), bufsize]);
            args.extend([s("-g"), gop]);
            args.extend([s("-r"), a.fps.to_string()]); // force the output frame rate
            // Force target height + even dimensions + broadcast-safe pixel format.
            args.extend([s("-vf"), format!("scale=-2:{}", a.height)]);
            args.extend([s("-pix_fmt"), s("yuv420p")]);
            // Tag full-range BT.709 to match the browser canvas (avoids washed-out
            // colors from a mislabeled limited-range/BT.601 default).
            args.extend([s("-color_range"), s("pc")]);
            args.extend([s("-colorspace"), s("bt709")]);
            args.extend([s("-color_primaries"), s("bt709"), s("-color_trc"), s("bt709")]);
        }
    }

    // Audio: AAC is required for FLV/RTMP.
    args.extend([s("-c:a"), s("aac"), s("-b:a"), s("128k"), s("-ar"), s("44100")]);

    // Low-latency muxing.
    args.extend([s("-flush_packets"), s("1")]);

    // Machine-readable progress on stderr (fd 2) every 0.5s. `-loglevel error`
    // otherwise suppresses the `frame=` stats the status parser keys on, so
    // without this the badge would never leave CONNECTING… on a healthy stream.
    args.extend([s("-progress"), s("pipe:2"), s("-stats_period"), s("0.5")]);

    // Output: a single FLV over RTMP(S).
    args.extend([s("-f"), s("flv"), a.rtmp_url.clone()]);

    args
}

/// True once ffmpeg's stderr shows encoding has started. `-progress pipe:2`
/// prints `frame=N` lines to stderr; the first one means the first frame was
/// committed, i.e. we are live. Pure so it can be unit-tested.
fn is_live_signal(line: &str) -> bool {
    line.contains("frame=")
}

/// Map a raw ffmpeg stderr line to a safe, human error message. Returns only
/// fixed strings (never the raw line) so the stream key — which appears in the
/// URL inside some ffmpeg error lines — can never leak. `None` = not an error we
/// recognise. Pure + unit-tested.
fn classify_error(line: &str) -> Option<&'static str> {
    let l = line.to_ascii_lowercase();
    if l.contains("connection refused") {
        Some("Can't reach the server (connection refused) — check the RTMP URL")
    } else if l.contains("403") || l.contains("forbidden") {
        Some("Rejected by the server (403) — check your stream key")
    } else if l.contains("401") || l.contains("unauthorized") {
        Some("Unauthorized (401) — check your stream key")
    } else if l.contains("404") || l.contains("not found") {
        Some("Ingest URL not found (404) — check the RTMP URL")
    } else if l.contains("broken pipe") || l.contains("connection reset") || l.contains("end of file")
    {
        Some("Connection dropped")
    } else if l.contains("timed out") || l.contains("timeout") {
        Some("Connection timed out — check your network / URL")
    } else if l.contains("name or service not known") || l.contains("failed to resolve") {
        Some("Can't resolve the server host — check the RTMP URL")
    } else if l.contains("server error") || l.contains("handshake") {
        Some("Server rejected the connection")
    } else {
        None
    }
}

/// Compose the full publish URL from a base RTMP(S) URL and a stream key.
/// `rtmp://host/app` + `key` → `rtmp://host/app/key`. Empty key → base as-is.
pub fn compose_rtmp_url(base: &str, key: &str) -> String {
    let base = base.trim().trim_end_matches('/');
    let key = key.trim();
    if key.is_empty() {
        base.to_string()
    } else {
        format!("{base}/{key}")
    }
}

/// Pick the H.264 encoder for this platform and whether it is hardware-backed.
/// Software (libx264) fallback triggers the 720p clamp to stay real-time.
fn select_encoder() -> (&'static str, bool) {
    #[cfg(target_os = "macos")]
    {
        ("h264_videotoolbox", true)
    }
    #[cfg(target_os = "windows")]
    {
        ("h264_mf", true)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        ("libx264", false)
    }
}

/// Structured status pushed to the frontend. Never carries the URL or key.
#[derive(Serialize, Clone)]
struct StreamStatus {
    state: &'static str, // connecting | live | unstable | ended | error
    dropped: u32,
    clamped: bool,
    message: Option<String>,
}

/// Live session handle held in managed state. Dropping it tears everything down.
pub struct StreamSession {
    tx: Option<SyncSender<Vec<u8>>>, // None after stop; dropping closes stdin
    child: Arc<Mutex<Child>>,
    alive: Arc<AtomicBool>,
    live: Arc<AtomicBool>, // set once ffmpeg reports the first frame
    dropped: Arc<AtomicU32>,
    saturated_since: Mutex<Option<Instant>>,
    clamped: bool,
    writer: Option<JoinHandle<()>>,
    stderr: Option<JoinHandle<()>>,
}

impl StreamSession {
    /// Close stdin, let ffmpeg exit cleanly, escalating to SIGTERM then SIGKILL.
    ///
    /// Ordering matters: we do NOT join the writer thread before the child is
    /// dead. Under sustained backpressure the writer can be parked inside
    /// `stdin.write_all` (ffmpeg's stdin pipe is full because ffmpeg is itself
    /// stalled on the slow network socket). Joining first would hang forever.
    /// So: drop the sender (clean stop → writer finishes, drops stdin → ffmpeg
    /// EOFs and exits), wait; else SIGTERM (graceful, disconnects RTMP cleanly);
    /// else SIGKILL. Each escalation also unblocks a parked write. Then join.
    fn shutdown(&mut self) {
        self.alive.store(false, Ordering::Relaxed);
        self.tx.take(); // drop sender → writer drains + drops stdin → ffmpeg EOF

        // 1) Clean: stdin EOF → ffmpeg exits on its own.
        if !self.wait_exit(STOP_TIMEOUT) {
            // 2) Stalled: ask ffmpeg to exit gracefully (interrupts a blocked write).
            {
                let c = self.child.lock().unwrap();
                request_graceful_exit(&c);
            }
            if !self.wait_exit(TERM_GRACE) {
                // 3) Last resort: hard kill (no zombies).
                let mut c = self.child.lock().unwrap();
                if let Ok(None) = c.try_wait() {
                    let _ = c.kill();
                    let _ = c.wait();
                }
            }
        }

        // Child is dead / EOF'd: both threads can now make progress and finish.
        if let Some(h) = self.writer.take() {
            let _ = h.join();
        }
        if let Some(h) = self.stderr.take() {
            let _ = h.join();
        }
    }

    /// Poll for the child to exit within `dur`. Returns true if it exited.
    fn wait_exit(&self, dur: Duration) -> bool {
        let deadline = Instant::now() + dur;
        loop {
            {
                let mut c = self.child.lock().unwrap();
                if matches!(c.try_wait(), Ok(Some(_))) {
                    return true;
                }
            }
            if Instant::now() >= deadline {
                return false;
            }
            thread::sleep(Duration::from_millis(50));
        }
    }
}

impl Drop for StreamSession {
    fn drop(&mut self) {
        self.shutdown();
    }
}

/// Ask ffmpeg to exit gracefully. SIGTERM lets it write trailers / disconnect
/// RTMP cleanly instead of being torn down mid-syscall.
#[cfg(unix)]
fn request_graceful_exit(child: &Child) {
    // Safety: kill() with a valid pid + signal is sound; a reaped pid just ESRCHs.
    unsafe {
        libc::kill(child.id() as libc::pid_t, libc::SIGTERM);
    }
}

#[cfg(not(unix))]
fn request_graceful_exit(_child: &Child) {
    // No SIGTERM on Windows; shutdown() falls through to kill() (TerminateProcess).
}

/// Managed live-stream state: the single session plus a `tearing_down` flag set
/// while a previous session's ffmpeg is still being killed off-thread. Without the
/// flag, a GO LIVE right after a backpressure auto-stop would pass the "is running"
/// check (the session was already taken) and spawn a 2nd ffmpeg publishing to the
/// same URL while the old one is still dying.
#[derive(Default)]
pub struct StreamState {
    session: Mutex<Option<StreamSession>>,
    tearing_down: AtomicBool,
}

/// Start a live stream. Spawns ffmpeg, wires stdin writer + stderr parser, and
/// stores the session. Errors if a session is already running or ffmpeg is
/// missing. The composed URL (with key) exists only inside the argv.
#[tauri::command]
pub async fn start_stream(
    app: AppHandle,
    state: State<'_, StreamState>,
    url: String,
    key: String,
    height: u32,
    fps: u32,
    bitrate_kbps: u32,
    copy: bool,
) -> Result<(), String> {
    {
        let guard = state.session.lock().unwrap();
        if guard.is_some() || state.tearing_down.load(Ordering::Relaxed) {
            return Err("a stream is already running".into());
        }
    }

    let base = url.trim();
    if base.is_empty() || key.trim().is_empty() {
        return Err("RTMP URL and stream key are required".into());
    }
    let rtmp_url = compose_rtmp_url(base, &key);

    // Copy path: the webview already encoded H.264 → ffmpeg remuxes, so there is
    // no encoder to pick, no scaling, and no clamp (resolution came from capture).
    let (encoder, is_hw) = select_encoder();
    let clamped = !copy && !is_hw && height > 720;
    let out_height = if clamped { 720 } else { height };
    let fps = fps.clamp(10, 60);
    let bitrate_kbps = bitrate_kbps.clamp(500, 12000);

    let args = build_ffmpeg_stream_args(&StreamArgs {
        rtmp_url,
        height: out_height,
        fps,
        bitrate_kbps,
        encode_mode: if copy { EncodeMode::Copy } else { EncodeMode::ReEncode },
        video_encoder: encoder.to_string(),
    });

    let ffmpeg = ffmpeg_path().ok_or("bundled ffmpeg binary not found")?;
    let mut child = Command::new(&ffmpeg)
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdin = child.stdin.take().ok_or("failed to open ffmpeg stdin")?;
    let stderr = child.stderr.take();

    let alive = Arc::new(AtomicBool::new(true));
    let live = Arc::new(AtomicBool::new(false));
    let dropped = Arc::new(AtomicU32::new(0));
    let child = Arc::new(Mutex::new(child));

    // Writer thread: pull chunks off the bounded channel, write to stdin. A write
    // error (ffmpeg gone / stdin closed) ends the thread.
    let (tx, rx) = sync_channel::<Vec<u8>>(CHUNK_BUFFER);
    let writer = {
        let alive = alive.clone();
        let mut stdin = stdin;
        thread::spawn(move || {
            while let Ok(chunk) = rx.recv() {
                if !alive.load(Ordering::Relaxed) {
                    break;
                }
                if stdin.write_all(&chunk).is_err() {
                    break;
                }
            }
            let _ = stdin.flush();
            // stdin dropped here → ffmpeg receives EOF.
        })
    };

    // Stderr parser: turn ffmpeg output into status events. The raw lines (which
    // include the argv/URL at startup) are NEVER emitted — only parsed states.
    let stderr_handle = stderr.map(|stderr| {
        let app = app.clone();
        let alive = alive.clone();
        let live = live.clone();
        let dropped = dropped.clone();
        thread::spawn(move || {
            let mut announced_live = false;
            let mut last_error: Option<&'static str> = None;
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if !alive.load(Ordering::Relaxed) {
                    break;
                }
                if let Some(msg) = classify_error(&line) {
                    last_error = Some(msg);
                }
                // First frame committed → we are live.
                if !announced_live && is_live_signal(&line) {
                    announced_live = true;
                    live.store(true, Ordering::Relaxed);
                    let _ = app.emit(
                        "stream-status",
                        StreamStatus {
                            state: "live",
                            dropped: dropped.load(Ordering::Relaxed),
                            clamped,
                            message: None,
                        },
                    );
                }
            }
            // stderr closed = ffmpeg exited. If the user didn't stop it, this is an
            // unexpected failure (bad URL/key, refused, dropped) — surface a reason
            // so the badge/panel isn't a bare "LIVE ERROR". (Does NOT clear the
            // managed session — the frontend calls stop on error to do that.)
            if alive.load(Ordering::Relaxed) {
                let _ = app.emit(
                    "stream-status",
                    StreamStatus {
                        state: "error",
                        dropped: dropped.load(Ordering::Relaxed),
                        clamped: false,
                        message: Some(
                            last_error.unwrap_or("Stream ended unexpectedly (ffmpeg exited)").to_string(),
                        ),
                    },
                );
            }
        })
    });

    // Announce connecting (+ clamp warning if we dropped to software 720p).
    let _ = app.emit(
        "stream-status",
        StreamStatus {
            state: "connecting",
            dropped: 0,
            clamped,
            message: clamped.then(|| "No hardware encoder — clamped to 720p".into()),
        },
    );

    *state.session.lock().unwrap() = Some(StreamSession {
        tx: Some(tx),
        child,
        alive,
        live,
        dropped,
        saturated_since: Mutex::new(None),
        clamped,
        writer: Some(writer),
        stderr: stderr_handle,
    });

    Ok(())
}

/// Feed one MediaRecorder chunk to the live ffmpeg. Non-blocking: if the buffer
/// is full (network can't keep up) the chunk is dropped and backpressure is
/// declared; if saturation persists past the grace window, the stream auto-stops
/// to protect memory. Returns Ok even on drop — dropping is expected, not fatal.
// Async so the per-chunk work runs off the main thread — a sync command would
// block the UI thread every ~500ms and stutter/freeze the compositor capture.
#[tauri::command]
pub async fn write_stream_chunk(
    app: AppHandle,
    state: State<'_, StreamState>,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let mut guard = state.session.lock().unwrap();
    let Some(session) = guard.as_mut() else {
        return Err("no active stream".into());
    };

    let Some(tx) = session.tx.as_ref() else {
        return Err("stream is stopping".into());
    };

    match tx.try_send(bytes) {
        Ok(()) => {
            // Drained — clear any saturation timer.
            *session.saturated_since.lock().unwrap() = None;
            Ok(())
        }
        Err(TrySendError::Full(_)) => {
            let n = session.dropped.fetch_add(1, Ordering::Relaxed) + 1;
            let mut sat = session.saturated_since.lock().unwrap();
            let since = *sat.get_or_insert_with(Instant::now);
            // Only count saturation toward auto-stop once we're actually live —
            // a slow RTMP/TLS handshake naturally stalls stdin reads at first and
            // must not be mistaken for a too-slow network.
            let over_grace =
                session.live.load(Ordering::Relaxed) && since.elapsed() >= OVERFLOW_GRACE;
            drop(sat);

            let _ = app.emit(
                "stream-status",
                StreamStatus {
                    state: "unstable",
                    dropped: n,
                    clamped: session.clamped,
                    message: None,
                },
            );

            if over_grace {
                // Sustained backpressure → tear down to stop memory growth.
                // shutdown() blocks (join + wait/kill up to STOP_TIMEOUT); this
                // command runs on the main thread, so offload the drop to a
                // detached thread and return immediately (no UI freeze).
                let session = guard.take();
                drop(guard);
                if let Some(session) = session {
                    // Mark teardown so a re-start can't spawn a 2nd ffmpeg while the
                    // old one is still dying; clear it once the drop completes.
                    state.tearing_down.store(true, Ordering::Relaxed);
                    let app2 = app.clone();
                    thread::spawn(move || {
                        drop(session); // Drop::shutdown()
                        app2.state::<StreamState>().tearing_down.store(false, Ordering::Relaxed);
                    });
                }
                let _ = app.emit(
                    "stream-status",
                    StreamStatus {
                        state: "error",
                        dropped: n,
                        clamped: false,
                        message: Some("Network too slow — stream stopped".into()),
                    },
                );
            }
            Ok(())
        }
        Err(TrySendError::Disconnected(_)) => Err("stream writer stopped".into()),
    }
}

/// Stop the live stream: flush the final chunk, close stdin, wait/kill ffmpeg,
/// and emit `ended`. No-op if nothing is running. Async + offloaded teardown so
/// END LIVE never blocks the main thread (shutdown can take up to STOP_TIMEOUT).
#[tauri::command]
pub async fn stop_stream(app: AppHandle, state: State<'_, StreamState>) -> Result<(), String> {
    let session = state.session.lock().unwrap().take();
    if let Some(session) = session {
        state.tearing_down.store(true, Ordering::Relaxed); // block re-start until fully dropped
        let dropped = session.dropped.load(Ordering::Relaxed);
        // Drop::shutdown() closes stdin, waits, kills on timeout — off the main thread.
        let _ = tauri::async_runtime::spawn_blocking(move || drop(session)).await;
        state.tearing_down.store(false, Ordering::Relaxed);
        let _ = app.emit(
            "stream-status",
            StreamStatus { state: "ended", dropped, clamped: false, message: None },
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn re_encode(height: u32) -> StreamArgs {
        StreamArgs {
            rtmp_url: "rtmp://live.example/app/KEY".into(),
            height,
            fps: 30,
            bitrate_kbps: 4500,
            encode_mode: EncodeMode::ReEncode,
            video_encoder: "h264_videotoolbox".into(),
        }
    }

    // Small helper: the value that follows `flag` in the argv.
    fn val_after<'a>(args: &'a [String], flag: &str) -> Option<&'a String> {
        args.iter().position(|a| a == flag).and_then(|i| args.get(i + 1))
    }

    #[test]
    fn reads_webm_from_stdin() {
        let args = build_ffmpeg_stream_args(&re_encode(1080));
        assert_eq!(val_after(&args, "-i").map(String::as_str), Some("pipe:0"));
    }

    #[test]
    fn bitrate_comes_from_the_param_as_cbr() {
        let mut a = re_encode(720);
        a.bitrate_kbps = 3500;
        let args = build_ffmpeg_stream_args(&a);
        // CBR: -b:v == -maxrate, -bufsize == 2×.
        assert_eq!(val_after(&args, "-b:v").map(String::as_str), Some("3500k"));
        assert_eq!(val_after(&args, "-maxrate").map(String::as_str), Some("3500k"));
        assert_eq!(val_after(&args, "-bufsize").map(String::as_str), Some("7000k"));
    }

    #[test]
    fn gop_and_output_fps_follow_fps() {
        let mut a = re_encode(1080);
        a.fps = 24;
        let args = build_ffmpeg_stream_args(&a);
        assert_eq!(val_after(&args, "-g").map(String::as_str), Some("48")); // 2×fps
        assert_eq!(val_after(&args, "-r").map(String::as_str), Some("24"));
    }

    #[test]
    fn videotoolbox_uses_realtime_mode() {
        let args = build_ffmpeg_stream_args(&re_encode(720));
        assert_eq!(val_after(&args, "-realtime").map(String::as_str), Some("1"));
    }

    #[test]
    fn libx264_uses_zerolatency_tune() {
        let mut a = re_encode(720);
        a.video_encoder = "libx264".into();
        let args = build_ffmpeg_stream_args(&a);
        assert_eq!(val_after(&args, "-tune").map(String::as_str), Some("zerolatency"));
    }

    #[test]
    fn scales_to_target_height() {
        let args = build_ffmpeg_stream_args(&re_encode(720));
        assert_eq!(val_after(&args, "-vf").map(String::as_str), Some("scale=-2:720"));
    }

    #[test]
    fn output_is_a_single_rtmp_flv_no_tee() {
        // RTMP-only: the local MP4 is captured separately on the frontend, so the
        // network can never degrade or block the local take.
        let args = build_ffmpeg_stream_args(&re_encode(1080));
        assert_eq!(val_after(&args, "-f").map(String::as_str), Some("flv"));
        assert_eq!(args.last().map(String::as_str), Some("rtmp://live.example/app/KEY"));
        assert!(!args.iter().any(|a| a.contains("tee")));
        assert!(!args.iter().any(|a| a == "-flags:v"));
    }

    #[test]
    fn copy_mode_skips_reencode_flags() {
        let mut a = re_encode(1080);
        a.encode_mode = EncodeMode::Copy;
        let args = build_ffmpeg_stream_args(&a);
        assert_eq!(val_after(&args, "-c:v").map(String::as_str), Some("copy"));
        assert!(val_after(&args, "-b:v").is_none());
        assert!(!args.iter().any(|a| a == "-vf"));
    }

    #[test]
    fn libx264_gets_a_realtime_preset() {
        let mut a = re_encode(720);
        a.video_encoder = "libx264".into();
        let args = build_ffmpeg_stream_args(&a);
        assert_eq!(val_after(&args, "-preset").map(String::as_str), Some("veryfast"));
    }

    #[test]
    fn audio_is_aac_for_rtmp() {
        let args = build_ffmpeg_stream_args(&re_encode(1080));
        assert_eq!(val_after(&args, "-c:a").map(String::as_str), Some("aac"));
    }

    #[test]
    fn rtmps_url_passes_through_untouched() {
        let mut a = re_encode(1080);
        a.rtmp_url = "rtmps://live.example:443/app/KEY".into();
        let args = build_ffmpeg_stream_args(&a);
        assert!(args.contains(&"rtmps://live.example:443/app/KEY".to_string()));
    }

    #[test]
    fn live_signal_detects_progress_frame_lines() {
        // `-progress pipe:2` emits these once encoding starts.
        assert!(is_live_signal("frame=12"));
        assert!(is_live_signal("frame=  30 fps=30 q=28.0"));
        // Non-frame progress / status lines are not a live signal.
        assert!(!is_live_signal("progress=continue"));
        assert!(!is_live_signal("bitrate=4500.0kbits/s"));
    }

    #[test]
    fn classify_error_maps_known_failures() {
        assert_eq!(
            classify_error("[tcp @ 0x0] Connection to tcp://h:1935 failed: Connection refused"),
            Some("Can't reach the server (connection refused) — check the RTMP URL"),
        );
        assert_eq!(
            classify_error("[https] Server returned 403 Forbidden"),
            Some("Rejected by the server (403) — check your stream key"),
        );
        assert!(classify_error("Connection reset by peer").is_some());
        assert!(classify_error("frame=123 fps=30 bitrate=4500").is_none());
    }

    #[test]
    fn classify_error_never_echoes_the_stream_key() {
        // Some ffmpeg error lines include the publish URL (with the key). The
        // classifier must return only fixed strings, never the raw line.
        let line = "Error opening output rtmp://live.example/app/SUPERSECRETKEY: Connection refused";
        let msg = classify_error(line).unwrap();
        assert!(!msg.contains("SUPERSECRETKEY"));
        assert!(!msg.contains("rtmp://"));
    }

    #[test]
    fn progress_is_routed_to_stderr() {
        let args = build_ffmpeg_stream_args(&re_encode(1080));
        assert_eq!(val_after(&args, "-progress").map(String::as_str), Some("pipe:2"));
    }

    #[test]
    fn compose_rtmp_url_joins_base_and_key() {
        assert_eq!(compose_rtmp_url("rtmp://h/app", "k"), "rtmp://h/app/k");
        assert_eq!(compose_rtmp_url("rtmp://h/app/", "k"), "rtmp://h/app/k");
        assert_eq!(compose_rtmp_url("rtmp://h/app", ""), "rtmp://h/app");
        assert_eq!(compose_rtmp_url("  rtmp://h/app  ", " k "), "rtmp://h/app/k");
    }
}
