// Real machine telemetry for the Ship Vitals HUD strip: battery, CPU, RAM,
// uptime. Polled ~every 2s from the frontend; a persistent `System` gives
// meaningful CPU deltas across calls (no blocking sleep in the command).

use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use sysinfo::System;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemVitals {
    /// Battery charge 0–100; `None` on machines without a battery.
    pub battery: Option<u8>,
    pub charging: bool,
    /// Global CPU usage, 0–100.
    pub cpu: u8,
    /// Used memory, 0–100.
    pub mem: u8,
    /// Seconds since boot (formatted on the frontend).
    pub uptime: u64,
}

// One long-lived System so consecutive (2s-apart) refreshes yield real CPU
// deltas. First call may read 0% CPU (no baseline yet) — acceptable.
fn system() -> &'static Mutex<System> {
    // new_all() populates the CPU list up front so global_cpu_usage() is valid
    // on every platform (an empty list is UB-adjacent on non-macOS targets).
    static SYS: OnceLock<Mutex<System>> = OnceLock::new();
    SYS.get_or_init(|| Mutex::new(System::new_all()))
}

// (battery %, charging). Best-effort: a missing battery or any probe failure
// degrades to (None, false) — never an error to the caller.
//
// iOS: starship-battery links IOKit (unavailable there), so battery is reported
// as absent. CPU/RAM/uptime below still work. (A native UIDevice battery read
// could fill this in later.)
#[cfg(target_os = "ios")]
fn read_battery() -> (Option<u8>, bool) {
    (None, false)
}

#[cfg(not(target_os = "ios"))]
fn read_battery() -> (Option<u8>, bool) {
    let manager = match starship_battery::Manager::new() {
        Ok(m) => m,
        Err(_) => return (None, false),
    };
    let mut batteries = match manager.batteries() {
        Ok(b) => b,
        Err(_) => return (None, false),
    };
    match batteries.next() {
        Some(Ok(bat)) => {
            let pct = (bat.state_of_charge().value * 100.0).round().clamp(0.0, 100.0) as u8;
            let charging = bat.state() == starship_battery::State::Charging;
            (Some(pct), charging)
        }
        _ => (None, false),
    }
}

#[tauri::command]
pub fn get_system_vitals() -> SystemVitals {
    // Recover a poisoned lock instead of panicking the command.
    let mut sys = system().lock().unwrap_or_else(|e| e.into_inner());
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu = sys.global_cpu_usage().round().clamp(0.0, 100.0) as u8;
    let total = sys.total_memory();
    let mem = if total > 0 {
        ((sys.used_memory() as f64 / total as f64) * 100.0)
            .round()
            .clamp(0.0, 100.0) as u8
    } else {
        0
    };
    let uptime = System::uptime();
    let (battery, charging) = read_battery();

    SystemVitals { battery, charging, cpu, mem, uptime }
}
