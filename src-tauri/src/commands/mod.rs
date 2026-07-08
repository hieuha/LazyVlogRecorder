// Backend commands invoked from the frontend data layer (Phase 3). These proxy
// external HTTP APIs from Rust so the webview never hits CORS and no API keys
// are needed (all free, keyless endpoints).

pub mod auth;
pub mod ffmpeg;
pub mod geo;
pub mod recording_fs;
pub mod sensor_server;
pub mod weather;
