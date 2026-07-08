// Transcode a recorded WebM to MP4 (H.264/AAC, faststart) using the bundled
// ffmpeg. Resolves the binary itself (dev: src-tauri/binaries; bundle: next to
// the executable) and runs it directly, which works reliably in both modes.

use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;

use super::recording_fs::SavedFile;

/// Transcode `temp_path` (WebM) to `filename` (MP4) in the output folder, delete
/// the temp file, and return the final path + size. ffmpeg runs on a blocking
/// thread so it never stalls the UI/IPC.
#[tauri::command]
pub async fn transcode_to_mp4(
    app: tauri::AppHandle,
    temp_path: String,
    filename: String,
) -> Result<SavedFile, String> {
    let base = app
        .path()
        .video_dir()
        .or_else(|_| app.path().download_dir())
        .map_err(|e| e.to_string())?;
    let dir = base.join("LazyVlogRecorder");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let out = dir.join(&filename);
    let out_path = out.to_string_lossy().into_owned();
    let ffmpeg = ffmpeg_path().ok_or("bundled ffmpeg binary not found")?;

    let temp = temp_path.clone();
    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new(&ffmpeg)
            .args([
                "-y", "-i", &temp, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
                &out_path,
            ])
            .output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    let _ = std::fs::remove_file(&temp_path); // best-effort cleanup

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail = stderr.lines().rev().take(3).collect::<Vec<_>>();
        return Err(format!("ffmpeg failed: {}", tail.join(" | ")));
    }
    Ok(SavedFile::at(out))
}

fn ffmpeg_path() -> Option<PathBuf> {
    let name = format!("ffmpeg-{}", target_triple());
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("ffmpeg")); // bundled (triple stripped)
            candidates.push(dir.join(&name)); // bundled (with triple)
        }
    }
    // Dev: binaries live under the crate directory.
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries").join(&name));
    candidates.into_iter().find(|p| p.exists())
}

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
