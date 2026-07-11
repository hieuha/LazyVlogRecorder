// LazyCamHUD — Tauri backend entrypoint.
// Registers the data-layer commands (weather / air-quality / geo proxies).
// Later phases add recording fs + ffmpeg transcode commands here.

mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        // Open append handles for in-progress recordings (one per temp file).
        .manage(commands::recording_fs::TempWriters::default());

    // ffmpeg transcode/remux/thumbnail + Go Live streaming spawn a subprocess,
    // which iOS forbids — they are desktop-only. The mobile handler omits them;
    // the record-path export moves into the webview in a later phase.
    #[cfg(desktop)]
    let builder = builder
        // Single live-stream session, guarded so only one runs at a time.
        .manage(commands::streaming::StreamState::default())
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
            commands::recording_fs::close_temp_recording,
            commands::recording_fs::move_temp,
            commands::recording_fs::delete_files,
            commands::ffmpeg::transcode_to_mp4,
            commands::ffmpeg::remux_to_mp4,
            commands::ffmpeg::generate_thumbnail,
            commands::sensor_server::start_sensor_server,
            commands::sensor_server::stop_sensor_server,
            commands::streaming::start_stream,
            commands::streaming::write_stream_chunk,
            commands::streaming::stop_stream,
            commands::system_vitals::get_system_vitals,
        ]);

    #[cfg(not(desktop))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        commands::auth::has_pin,
        commands::auth::set_pin,
        commands::auth::verify_pin,
        commands::auth::change_pin,
        commands::geo::geo_locate,
        commands::geo::geocode_city,
        commands::weather::get_weather,
        commands::recording_fs::start_temp_recording,
        commands::recording_fs::append_temp_chunk,
        commands::recording_fs::close_temp_recording,
        commands::recording_fs::move_temp,
        commands::recording_fs::delete_files,
        commands::sensor_server::start_sensor_server,
        commands::sensor_server::stop_sensor_server,
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
