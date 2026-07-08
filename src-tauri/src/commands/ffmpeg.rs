// Transcode a recorded WebM to MP4 (H.264/AAC, faststart) using the bundled
// ffmpeg. Resolves the binary itself (dev: src-tauri/binaries; bundle: next to
// the executable) and runs it directly, which works reliably in both modes.

use std::path::PathBuf;
use std::process::Command;

use super::recording_fs::{resolve_out_dir, SavedFile};

/// Transcode `temp_path` (WebM) to `filename` (MP4) in the output folder, delete
/// the temp file, and return the final path + size. ffmpeg runs on a blocking
/// thread so it never stalls the UI/IPC.
#[tauri::command]
pub async fn transcode_to_mp4(
    app: tauri::AppHandle,
    temp_path: String,
    filename: String,
    out_dir: Option<String>,
) -> Result<SavedFile, String> {
    let out = resolve_out_dir(&app, out_dir)?.join(&filename);
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

    if !output.status.success() {
        // Keep the temp file so the caller can fall back to saving it raw.
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail = stderr.lines().rev().take(3).collect::<Vec<_>>();
        return Err(format!("ffmpeg failed: {}", tail.join(" | ")));
    }
    let _ = std::fs::remove_file(&temp_path); // cleanup only on success
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
