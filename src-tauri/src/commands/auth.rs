// Local PIN gate. Stores a salted SHA-256 of the PIN in the app config dir.
// This is a UX lock (deters casual access); recordings themselves are not
// encrypted at rest.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize, Deserialize)]
struct AuthData {
    salt: String,
    hash: String,
}

fn auth_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("auth.json"))
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn hash_pin(salt: &str, pin: &str) -> String {
    let mut h = Sha256::new();
    h.update(salt.as_bytes());
    h.update(pin.as_bytes());
    to_hex(&h.finalize())
}

fn read_auth(app: &tauri::AppHandle) -> Option<AuthData> {
    let path = auth_path(app).ok()?;
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

#[tauri::command]
pub fn has_pin(app: tauri::AppHandle) -> bool {
    read_auth(&app).is_some()
}

#[tauri::command]
pub fn set_pin(app: tauri::AppHandle, pin: String) -> Result<(), String> {
    let mut salt_bytes = [0u8; 16];
    getrandom::getrandom(&mut salt_bytes).map_err(|e| e.to_string())?;
    let salt = to_hex(&salt_bytes);
    let data = AuthData { hash: hash_pin(&salt, &pin), salt };
    let json = serde_json::to_string(&data).map_err(|e| e.to_string())?;
    std::fs::write(auth_path(&app)?, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn verify_pin(app: tauri::AppHandle, pin: String) -> bool {
    match read_auth(&app) {
        Some(d) => hash_pin(&d.salt, &pin) == d.hash,
        None => false,
    }
}

#[tauri::command]
pub fn change_pin(app: tauri::AppHandle, old_pin: String, new_pin: String) -> Result<(), String> {
    if !verify_pin(app.clone(), old_pin) {
        return Err("Current PIN is incorrect".into());
    }
    set_pin(app, new_pin)
}
