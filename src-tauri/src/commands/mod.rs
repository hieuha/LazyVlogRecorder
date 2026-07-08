// Backend commands invoked from the frontend data layer (Phase 3). These proxy
// external HTTP APIs from Rust so the webview never hits CORS and no API keys
// are needed (all free, keyless endpoints).

pub mod geo;
pub mod weather;
