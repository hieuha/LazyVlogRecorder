// Backend commands invoked from the frontend data layer (Phase 3). These proxy
// external HTTP APIs from Rust so the webview never hits CORS and no API keys
// are needed (all free, keyless endpoints).

pub mod auth;
// ffmpeg + streaming spawn a bundled ffmpeg subprocess; iOS forbids spawning
// child processes, so they are desktop-only. Record-path export moves into the
// webview (mp4box.js) in a later phase; Go Live stays macOS-only for now.
#[cfg(desktop)]
pub mod ffmpeg;
pub mod geo;
pub mod recording_fs;
pub mod sensor_server;
#[cfg(desktop)]
pub mod streaming;
pub mod system_vitals;
pub mod weather;
