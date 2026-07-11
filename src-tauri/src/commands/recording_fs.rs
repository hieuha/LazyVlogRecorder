// Recording persistence. To keep memory flat for long clips, the frontend
// streams MediaRecorder chunks straight to a temp file during recording
// (start → append × N), then Phase 5 transcodes that temp file to MP4.

use serde::Serialize;
use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

/// Open append handles for in-progress recordings, keyed by temp path. Holding
/// one handle per recording avoids reopening the file on every ~250ms chunk
/// (open+write+close × ~4/s). Each handle is behind its own `Mutex` so the
/// actual write can run in `spawn_blocking` (off the async runtime thread) while
/// still serializing writes to that file. Handles are dropped (closed) by
/// `close_temp_recording` before the file is transcoded/moved.
#[derive(Default)]
pub struct TempWriters(pub Mutex<HashMap<String, Arc<Mutex<File>>>>);

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

/// Append a recorded chunk to the temp file. The chunk rides in as the raw IPC
/// body (`Request`) instead of a JSON `Vec<u8>` — a nested typed array would be
/// serialized as a number array (~4× the bytes) and parsed back per chunk; the
/// raw body is a straight memcpy. The temp path travels in the `x-temp-path`
/// header (percent-encoded frontend-side). The append handle is opened once and
/// reused (see `TempWriters`); the write runs in spawn_blocking so slow disk IO
/// never stalls the async runtime / compositor capture.
#[tauri::command]
pub async fn append_temp_chunk(
    state: State<'_, TempWriters>,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    let path = request
        .headers()
        .get("x-temp-path")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .ok_or_else(|| "missing x-temp-path header".to_string())?;
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(data) => data.clone(),
        _ => return Err("expected raw chunk body".into()),
    };
    drop(request); // release the borrow before crossing the await

    // Reuse the open handle for this path, or open (append) + cache it once.
    let file = {
        let mut writers = state.0.lock().unwrap();
        match writers.get(&path) {
            Some(f) => f.clone(),
            None => {
                let f = std::fs::OpenOptions::new()
                    .append(true)
                    .open(&path)
                    .map_err(|e| e.to_string())?;
                let handle = Arc::new(Mutex::new(f));
                writers.insert(path, handle.clone());
                handle
            }
        }
    };

    tauri::async_runtime::spawn_blocking(move || {
        let mut f = file.lock().unwrap();
        f.write_all(&bytes).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Close (flush) the append handle for a temp recording. Called after the last
/// chunk is written and before the file is transcoded/moved, so no handle stays
/// open across the read (matters on Windows, where an open writer blocks rename).
/// Best-effort: unknown paths are a no-op.
#[tauri::command]
pub fn close_temp_recording(state: State<'_, TempWriters>, path: String) {
    state.0.lock().unwrap().remove(&path); // drop → close the fd
}

/// Decode `encodeURIComponent` output (percent-escaped UTF-8) from the header-
/// carried temp path. Dependency-free; unrecognized escapes pass through.
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(hi), Some(lo)) = (hex_nibble(b[i + 1]), hex_nibble(b[i + 2])) {
                out.push((hi << 4) | lo);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_nibble(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
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
