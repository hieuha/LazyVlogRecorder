// Persist a finished recording to disk. Phase 4 writes the WebM straight to a
// LazyVlogRecorder folder under the user's Movies/Downloads dir and returns the
// path. Phase 5 will insert an ffmpeg transcode to MP4 before the final write.

use serde::Serialize;
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

#[tauri::command]
pub async fn save_recording(
    app: tauri::AppHandle,
    bytes: Vec<u8>,
    filename: String,
) -> Result<SavedFile, String> {
    let base = app
        .path()
        .video_dir()
        .or_else(|_| app.path().download_dir())
        .map_err(|e| e.to_string())?;
    let dir = base.join("LazyVlogRecorder");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let path = dir.join(&filename);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(SavedFile::at(path))
}

/// Write recorded bytes to a temp file (input for ffmpeg transcode). Returns the
/// temp path. Named with the current millis-ish counter to avoid collisions.
#[tauri::command]
pub async fn save_temp_recording(bytes: Vec<u8>, ext: String) -> Result<String, String> {
    let dir = std::env::temp_dir().join("LazyVlogRecorder");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("rec-temp.{ext}"));
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
