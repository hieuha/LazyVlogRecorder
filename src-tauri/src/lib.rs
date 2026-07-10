// LazyCamHUD — Tauri backend entrypoint.
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
            commands::auth::has_pin,
            commands::auth::set_pin,
            commands::auth::verify_pin,
            commands::auth::change_pin,
            commands::geo::geo_locate,
            commands::geo::geocode_city,
            commands::weather::get_weather,
            commands::recording_fs::start_temp_recording,
            commands::recording_fs::append_temp_chunk,
            commands::recording_fs::move_temp,
            commands::recording_fs::delete_files,
            commands::ffmpeg::transcode_to_mp4,
            commands::ffmpeg::generate_thumbnail,
            commands::sensor_server::start_sensor_server,
            commands::sensor_server::stop_sensor_server,
            commands::system_vitals::get_system_vitals,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
