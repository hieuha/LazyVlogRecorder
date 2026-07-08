// LazyVlogRecorder — Tauri backend entrypoint.
// Registers the data-layer commands (weather / air-quality / geo proxies).
// Later phases add recording fs + ffmpeg transcode commands here.

mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::geo::geo_locate,
            commands::weather::get_weather,
            commands::recording_fs::save_recording,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
