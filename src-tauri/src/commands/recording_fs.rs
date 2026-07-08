// Recording persistence. To keep memory flat for long clips, the frontend
// streams MediaRecorder chunks straight to a temp file during recording
// (start → append × N), then Phase 5 transcodes that temp file to MP4.

use serde::Serialize;
use std::io::Write;
use tauri::Manager;

#[derive(Serialize)]
pub struct SavedFile {
    pub path: String,
    pub size: u64,
}

impl SavedFile {
    pub fn at(path: std::path::PathBuf) -> Self {
        let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        SavedFile { path: path.to_string_lossy().into_owned(), size }
    }
}

/// Resolve (and create) the output directory: a user override when non-empty,
/// otherwise Movies/LazyCamHUD (or Downloads fallback).
pub fn resolve_out_dir(
    app: &tauri::AppHandle,
    out_dir: Option<String>,
) -> Result<std::path::PathBuf, String> {
    let dir = match out_dir {
        Some(d) if !d.trim().is_empty() => std::path::PathBuf::from(d),
        _ => app
            .path()
            .video_dir()
            .or_else(|_| app.path().download_dir())
            .map_err(|e| e.to_string())?
            .join("LazyCamHUD"),
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Create an empty temp file for a new recording; returns its path.
#[tauri::command]
pub fn start_temp_recording(ext: String) -> Result<String, String> {
    let dir = std::env::temp_dir().join("LazyCamHUD");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path = dir.join(format!("rec-{stamp}.{ext}"));
    std::fs::write(&path, b"").map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Append a recorded chunk to the temp file.
#[tauri::command]
pub fn append_temp_chunk(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let mut f = std::fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    f.write_all(&bytes).map_err(|e| e.to_string())?;
    Ok(())
}

/// Delete files (e.g. a recording + its thumbnail). Best-effort per path.
#[tauri::command]
pub fn delete_files(paths: Vec<String>) -> Result<(), String> {
    for p in paths {
        let _ = std::fs::remove_file(p);
    }
    Ok(())
}

/// Move the temp file into the output folder as `filename` (fallback when MP4
/// transcode is unavailable, so the raw take is never lost).
#[tauri::command]
pub async fn move_temp(
    app: tauri::AppHandle,
    temp_path: String,
    filename: String,
    out_dir: Option<String>,
) -> Result<SavedFile, String> {
    let dest = resolve_out_dir(&app, out_dir)?.join(&filename);
    if std::fs::rename(&temp_path, &dest).is_err() {
        std::fs::copy(&temp_path, &dest).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&temp_path);
    }
    Ok(SavedFile::at(dest))
}
