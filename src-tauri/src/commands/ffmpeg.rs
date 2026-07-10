// Transcode a recorded WebM to MP4 (H.264/AAC, faststart) using the bundled
// ffmpeg. Resolves the binary itself (dev: src-tauri/binaries; bundle: next to
// the executable) and runs it directly, which works reliably in both modes.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{Emitter, Manager};

use super::recording_fs::{resolve_out_dir, SavedFile};

/// Transcode `temp_path` (WebM) to `filename` (MP4), emitting `transcode-progress`
/// (0..1) events. ffmpeg runs on a blocking thread so it never stalls the UI.
#[tauri::command]
pub async fn transcode_to_mp4(
    app: tauri::AppHandle,
    temp_path: String,
    filename: String,
    out_dir: Option<String>,
    duration_sec: f64,
    hardware: bool,
) -> Result<SavedFile, String> {
    let out = resolve_out_dir(&app, out_dir)?.join(&filename);
    let out_path = out.to_string_lossy().into_owned();
    let ffmpeg = ffmpeg_path().ok_or("bundled ffmpeg binary not found")?;

    let temp = temp_path.clone();
    let app2 = app.clone();
    let ok = tauri::async_runtime::spawn_blocking(move || {
        // Hardware first (Apple Media Engine via VideoToolbox — fast, cool). If it
        // fails (no HW encoder), fall back to software libx264 so a take is never lost.
        if hardware && run_ffmpeg(&app2, &ffmpeg, &temp, &out_path, duration_sec, true)? {
            return Ok(true);
        }
        run_ffmpeg(&app2, &ffmpeg, &temp, &out_path, duration_sec, false)
    })
    .await
    .map_err(|e| e.to_string())??;

    if !ok {
        // Keep the temp file so the caller can fall back to saving it raw.
        return Err("ffmpeg transcode failed".into());
    }
    let _ = std::fs::remove_file(&temp_path); // cleanup only on success
    let _ = app.emit("transcode-progress", 1.0_f64);
    Ok(SavedFile::at(out))
}

fn run_ffmpeg(
    app: &tauri::AppHandle,
    ffmpeg: &PathBuf,
    input: &str,
    output: &str,
    duration_sec: f64,
    hardware: bool,
) -> Result<bool, String> {
    // Video codec args: hardware VideoToolbox (constant quality) vs software x264.
    let video: &[&str] = if hardware {
        &["-c:v", "h264_videotoolbox", "-q:v", "60"]
    } else {
        &["-c:v", "libx264", "-preset", "medium", "-crf", "26"]
    };
    let mut child = Command::new(ffmpeg)
        .args(["-y", "-i", input])
        .args(video)
        .args([
            // Tag as full-range BT.709 to match the browser canvas (full-range sRGB).
            // Without this ffmpeg mislabels it limited-range BT.601 → washed-out colors.
            "-pix_fmt", "yuv420p", "-color_range", "pc",
            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
            "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
            "-progress", "pipe:1", "-nostats", output,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;

    if let Some(stdout) = child.stdout.take() {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(us) = line.strip_prefix("out_time_us=") {
                if duration_sec > 0.0 {
                    if let Ok(v) = us.trim().parse::<f64>() {
                        let frac = (v / 1_000_000.0 / duration_sec).clamp(0.0, 0.99);
                        let _ = app.emit("transcode-progress", frac);
                    }
                }
            }
        }
    }
    Ok(child.wait().map_err(|e| e.to_string())?.success())
}

/// Remux an already-H.264 recording (the fragmented MP4 the webview produced in
/// the streaming copy path) to a normal faststart MP4 — no re-encode, so it's
/// fast and keeps full quality. Falls back handled by the caller.
#[tauri::command]
pub async fn remux_to_mp4(
    app: tauri::AppHandle,
    temp_path: String,
    filename: String,
    out_dir: Option<String>,
) -> Result<SavedFile, String> {
    let out = resolve_out_dir(&app, out_dir)?.join(&filename);
    let out_path = out.to_string_lossy().into_owned();
    let ffmpeg = ffmpeg_path().ok_or("bundled ffmpeg binary not found")?;

    let temp = temp_path.clone();
    let ok = tauri::async_runtime::spawn_blocking(move || {
        Command::new(&ffmpeg)
            .args(["-y", "-i", &temp, "-c", "copy", "-movflags", "+faststart", &out_path])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    if !ok {
        return Err("remux failed".into());
    }
    let _ = std::fs::remove_file(&temp_path);
    Ok(SavedFile::at(out))
}

/// Extract a JPEG thumbnail (~1s in) for a recording into the app cache dir.
#[tauri::command]
pub async fn generate_thumbnail(
    app: tauri::AppHandle,
    video_path: String,
    id: String,
) -> Result<String, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("thumbs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let thumb = dir.join(format!("{id}.jpg")).to_string_lossy().into_owned();
    let ffmpeg = ffmpeg_path().ok_or("bundled ffmpeg binary not found")?;

    let (video, out) = (video_path, thumb.clone());
    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new(&ffmpeg)
            .args(["-y", "-ss", "1", "-i", &video, "-frames:v", "1", "-vf", "scale=480:-1", &out])
            .output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err("thumbnail generation failed".into());
    }
    Ok(thumb)
}

pub(crate) fn ffmpeg_path() -> Option<PathBuf> {
    // Windows sidecars keep the .exe extension; std::process::Command with a full
    // path does not append it, so include it in the candidate file names.
    let bundled = format!("ffmpeg{EXE_SUFFIX}"); // next to the app exe (triple stripped)
    let named = format!("ffmpeg-{}{}", target_triple(), EXE_SUFFIX); // with triple (dev)
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(&bundled)); // bundled (triple stripped)
            candidates.push(dir.join(&named)); // bundled (with triple)
        }
    }
    // Dev: binaries live under the crate directory.
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries").join(&named));
    candidates.into_iter().find(|p| p.exists())
}

#[cfg(target_os = "windows")]
const EXE_SUFFIX: &str = ".exe";
#[cfg(not(target_os = "windows"))]
const EXE_SUFFIX: &str = "";

#[cfg(target_os = "macos")]
fn target_triple() -> String {
    format!("{}-apple-darwin", std::env::consts::ARCH)
}

#[cfg(target_os = "windows")]
fn target_triple() -> String {
    format!("{}-pc-windows-msvc", std::env::consts::ARCH)
}

#[cfg(target_os = "linux")]
fn target_triple() -> String {
    format!("{}-unknown-linux-gnu", std::env::consts::ARCH)
}
