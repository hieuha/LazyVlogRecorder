// Persist a finished recording to disk. Phase 4 writes the WebM straight to a
// LazyVlogRecorder folder under the user's Movies/Downloads dir and returns the
// path. Phase 5 will insert an ffmpeg transcode to MP4 before the final write.

use tauri::Manager;

#[tauri::command]
pub async fn save_recording(
    app: tauri::AppHandle,
    bytes: Vec<u8>,
    filename: String,
) -> Result<String, String> {
    let base = app
        .path()
        .video_dir()
        .or_else(|_| app.path().download_dir())
        .map_err(|e| e.to_string())?;
    let dir = base.join("LazyVlogRecorder");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let path = dir.join(&filename);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
