// Local HTTP endpoint that external sensors POST readings to; the payload is
// forwarded to the frontend (event "sensors") and rendered on the HUD, so it is
// burned into the recording. Runs a tiny_http server on a background thread.
//
// Contract:
//   POST /sensors    Authorization: Bearer <token>
//   { "items": [ { "label": "CO2", "value": "812", "unit": "ppm" } ] }
// Only display text is accepted — nothing is executed. Payload is clamped so a
// device cannot overflow the HUD or memory.

use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Method, Response, Server};

const MAX_BODY: usize = 8 * 1024; // 8 KB
const MAX_ITEMS: usize = 6;
const MAX_LABEL: usize = 12;
const MAX_VALUE: usize = 10;
const MAX_UNIT: usize = 6;
const MAX_TEXT: usize = 120;

#[derive(Deserialize)]
struct Payload {
    items: Vec<RawItem>,
}

#[derive(Deserialize)]
struct RawItem {
    label: String,
    value: String,
    #[serde(default)]
    unit: String,
}

#[derive(Serialize, Clone)]
struct Item {
    label: String,
    value: String,
    unit: String,
}

// One point of a time series (POST /series) — numeric value plotted as a sparkline.
#[derive(Deserialize)]
struct RawPoint {
    label: String,
    value: f64,
    #[serde(default)]
    unit: String,
}

#[derive(Serialize, Clone)]
struct Point {
    label: String,
    value: f64,
    unit: String,
}

// Free-text caption (POST /text) shown with a typewriter effect.
#[derive(Deserialize)]
struct RawText {
    text: String,
    typing: Option<bool>,
}

#[derive(Serialize, Clone)]
struct Caption {
    text: String,
    typing: bool,
}

struct Running {
    server: Arc<Server>,
    alive: Arc<AtomicBool>,
}

// Single running instance; replaced when settings change.
static SERVER: Mutex<Option<Running>> = Mutex::new(None);

/// Start (or restart) the sensor server. Binds `0.0.0.0` when `bind_lan`, else
/// `127.0.0.1`. When `token` is non-empty it is required on every request.
#[tauri::command]
pub fn start_sensor_server(
    app: AppHandle,
    port: u16,
    bind_lan: bool,
    token: String,
) -> Result<(), String> {
    stop_sensor_server(); // enforce a single instance

    let host = if bind_lan { "0.0.0.0" } else { "127.0.0.1" };
    let addr = format!("{host}:{port}");
    let server = Server::http(&addr).map_err(|e| format!("cannot bind {addr}: {e}"))?;
    let server = Arc::new(server);
    let alive = Arc::new(AtomicBool::new(true));

    let srv = server.clone();
    let alive2 = alive.clone();
    let expected = if token.is_empty() {
        None
    } else {
        Some(format!("Bearer {token}"))
    };

    thread::spawn(move || {
        for request in srv.incoming_requests() {
            if !alive2.load(Ordering::Relaxed) {
                break;
            }
            handle(&app, request, expected.as_deref());
        }
    });

    *SERVER.lock().unwrap() = Some(Running { server, alive });
    Ok(())
}

/// Stop the server if one is running (no-op otherwise).
#[tauri::command]
pub fn stop_sensor_server() {
    if let Some(r) = SERVER.lock().unwrap().take() {
        r.alive.store(false, Ordering::Relaxed);
        r.server.unblock(); // break incoming_requests()
    }
}

fn handle(app: &AppHandle, mut request: tiny_http::Request, expected: Option<&str>) {
    // Routes: POST /sensors (scalar readouts) and POST /series (chart points).
    let path = request.url().split('?').next().unwrap_or("").to_string();
    if *request.method() != Method::Post
        || (path != "/sensors" && path != "/series" && path != "/text")
    {
        return json(request, 404, r#"{"ok":false,"error":"not found"}"#);
    }

    // Token (when configured).
    if let Some(expected) = expected {
        let provided = request
            .headers()
            .iter()
            .find(|h| h.field.equiv("Authorization"))
            .map(|h| h.value.as_str().to_string());
        if provided.as_deref() != Some(expected) {
            return json(request, 401, r#"{"ok":false,"error":"unauthorized"}"#);
        }
    }

    // Size guard + read body (common to both routes).
    if request.body_length().map(|n| n > MAX_BODY).unwrap_or(false) {
        return json(request, 413, r#"{"ok":false,"error":"too large"}"#);
    }
    let mut body = String::new();
    if request
        .as_reader()
        .take(MAX_BODY as u64 + 1)
        .read_to_string(&mut body)
        .is_err()
        || body.len() > MAX_BODY
    {
        return json(request, 413, r#"{"ok":false,"error":"too large"}"#);
    }

    if path == "/sensors" {
        let Ok(payload) = serde_json::from_str::<Payload>(&body) else {
            return json(request, 400, r#"{"ok":false,"error":"bad json"}"#);
        };
        let items: Vec<Item> = payload
            .items
            .into_iter()
            .take(MAX_ITEMS)
            .map(|it| Item {
                label: clip(&it.label, MAX_LABEL),
                value: clip(&it.value, MAX_VALUE),
                unit: clip(&it.unit, MAX_UNIT),
            })
            .collect();
        let count = items.len();
        let _ = app.emit("sensors", items);
        json(request, 200, &format!(r#"{{"ok":true,"count":{count}}}"#));
    } else if path == "/series" {
        // /series — one numeric point appended to the label's sparkline buffer.
        let Ok(p) = serde_json::from_str::<RawPoint>(&body) else {
            return json(request, 400, r#"{"ok":false,"error":"bad json"}"#);
        };
        if !p.value.is_finite() {
            return json(request, 400, r#"{"ok":false,"error":"value not finite"}"#);
        }
        let point = Point {
            label: clip(&p.label, MAX_LABEL),
            value: p.value,
            unit: clip(&p.unit, MAX_UNIT),
        };
        let _ = app.emit("series", point);
        json(request, 200, r#"{"ok":true}"#);
    } else {
        // /text — a free-text caption rendered with a typewriter effect.
        let Ok(t) = serde_json::from_str::<RawText>(&body) else {
            return json(request, 400, r#"{"ok":false,"error":"bad json"}"#);
        };
        let caption = Caption {
            text: clip(&t.text, MAX_TEXT),
            typing: t.typing.unwrap_or(true),
        };
        let _ = app.emit("text", caption);
        json(request, 200, r#"{"ok":true}"#);
    }
}

fn clip(s: &str, max: usize) -> String {
    s.trim().chars().take(max).collect()
}

// Respond with a JSON body so clients get clear feedback (curl prints it).
fn json(request: tiny_http::Request, status: u16, body: &str) {
    let ct = Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
        .expect("valid header");
    let _ = request.respond(Response::from_string(body).with_status_code(status).with_header(ct));
}
