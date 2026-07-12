// Library backend: persist a thumbnail rendered in the webview.
//
// Thumbnails used to be extracted with the bundled ffmpeg, but iOS forbids
// spawning subprocesses. Instead the webview renders the frame (<video> seek →
// canvas) and sends the JPEG bytes here. They live in the app DATA dir (next to
// the entry index), not Caches: iOS purges Caches on update / under disk
// pressure, which orphaned every saved clip's thumbnail. The webview still
// regenerates a missing thumbnail on demand as a backstop.

use tauri::Manager;

/// Write `bytes` (a JPEG produced in the webview) to `<data>/thumbs/{id}.jpg`
/// and return the file path. `id` is app-generated (timestamp + log number) and
/// contains no path separators, so it can't escape the thumbs dir.
#[tauri::command]
pub fn save_thumbnail(app: tauri::AppHandle, id: String, bytes: Vec<u8>) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("thumbs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{id}.jpg"));
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Return, for each input path, whether the file still exists. Uses stat (not an
/// open), so a present-but-locked file under Data Protection still reports true —
/// only genuinely deleted files (e.g. after an app reinstall) report false, which
/// the library uses to flag entries as missing.
#[tauri::command]
pub fn paths_exist(paths: Vec<String>) -> Vec<bool> {
    paths
        .into_iter()
        .map(|p| !p.is_empty() && std::path::Path::new(&p).exists())
        .collect()
}
