// Local PIN gate. Stores a salted SHA-256 of the PIN in the OS Keychain (macOS +
// iOS, via the Apple Security framework). This is a UX lock (deters casual
// access), not encryption — recordings themselves are not encrypted at rest
// (though iOS Data Protection encrypts the sandbox when the device has a
// passcode). The 4-digit PIN is still brute-forceable offline; hashing + salting
// is basic hygiene so the raw digits are never stored.

use keyring::Entry;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::Manager;

// Keychain coordinates for the PIN entry. One generic-password item holds the
// salt+hash JSON. Keeping the service stable across versions preserves the PIN.
const KEYCHAIN_SERVICE: &str = "com.hatrunghieu.lazycamhud";
const KEYCHAIN_ACCOUNT: &str = "pin";

#[derive(Serialize, Deserialize)]
struct AuthData {
    salt: String,
    hash: String,
}

fn keychain_entry() -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|e| e.to_string())
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

fn read_auth() -> Option<AuthData> {
    let raw = keychain_entry().ok()?.get_password().ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_auth(data: &AuthData) -> Result<(), String> {
    let json = serde_json::to_string(data).map_err(|e| e.to_string())?;
    keychain_entry()?.set_password(&json).map_err(|e| e.to_string())
}

/// Older builds stored the salt+hash in `app_config_dir/auth.json`. If the
/// Keychain has no PIN yet but that file exists, move it into the Keychain and
/// delete the file (one-time). Returns whether a PIN now exists.
fn migrate_legacy_auth(app: &tauri::AppHandle) -> bool {
    let path: PathBuf = match app.path().app_config_dir() {
        Ok(dir) => dir.join("auth.json"),
        Err(_) => return false,
    };
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return false;
    };
    let Ok(data) = serde_json::from_str::<AuthData>(&raw) else {
        return false;
    };
    if write_auth(&data).is_ok() {
        let _ = std::fs::remove_file(&path);
        true
    } else {
        false
    }
}

#[tauri::command]
pub fn has_pin(app: tauri::AppHandle) -> bool {
    read_auth().is_some() || migrate_legacy_auth(&app)
}

#[tauri::command]
pub fn set_pin(pin: String) -> Result<(), String> {
    let mut salt_bytes = [0u8; 16];
    getrandom::getrandom(&mut salt_bytes).map_err(|e| e.to_string())?;
    let salt = to_hex(&salt_bytes);
    write_auth(&AuthData { hash: hash_pin(&salt, &pin), salt })
}

#[tauri::command]
pub fn verify_pin(pin: String) -> bool {
    match read_auth() {
        Some(d) => hash_pin(&d.salt, &pin) == d.hash,
        None => false,
    }
}

#[tauri::command]
pub fn change_pin(old_pin: String, new_pin: String) -> Result<(), String> {
    if !verify_pin(old_pin) {
        return Err("Current PIN is incorrect".into());
    }
    set_pin(new_pin)
}
