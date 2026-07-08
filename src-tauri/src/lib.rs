// LazyVlogRecorder — Tauri backend entrypoint.
// Phase 1: minimal app shell. Later phases register commands here
// (weather/air-quality/geo proxies, recording fs, ffmpeg transcode).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
