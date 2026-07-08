// LazyVlogRecorder — Tauri backend entrypoint.
// Registers the data-layer commands (weather / air-quality / geo proxies).
// Later phases add recording fs + ffmpeg transcode commands here.

mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::geo::geo_locate,
            commands::geo::geocode_city,
            commands::weather::get_weather,
            commands::recording_fs::start_temp_recording,
            commands::recording_fs::append_temp_chunk,
            commands::recording_fs::move_temp,
            commands::ffmpeg::transcode_to_mp4,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
