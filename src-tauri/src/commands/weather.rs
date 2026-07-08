// Current weather via Open-Meteo (free, keyless). Feeds HUMIDITY, RAIN chance
// (current-hour precipitation probability), TEMP, and ENVIRONMENT (weather_code).

use serde::Serialize;

#[derive(Serialize)]
pub struct Weather {
    /// NaN serializes to null → frontend renders "--".
    pub temp_c: f64,
    pub humidity: f64,
    /// Current-hour precipitation probability (%). None → "--".
    pub precip_prob: Option<f64>,
    pub weather_code: i64,
}

#[tauri::command]
pub async fn get_weather(lat: f64, lon: f64) -> Result<Weather, String> {
    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}\
         &current=temperature_2m,relative_humidity_2m,weather_code\
         &hourly=precipitation_probability&forecast_days=1&timezone=auto"
    );
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let cur = v.get("current").ok_or("no current weather in response")?;

    Ok(Weather {
        temp_c: cur["temperature_2m"].as_f64().unwrap_or(f64::NAN),
        humidity: cur["relative_humidity_2m"].as_f64().unwrap_or(f64::NAN),
        precip_prob: current_hour_precip(&v, cur),
        weather_code: cur["weather_code"].as_i64().unwrap_or(-1),
    })
}

// Match the current hour against the hourly series to read its precip chance.
fn current_hour_precip(v: &serde_json::Value, cur: &serde_json::Value) -> Option<f64> {
    let cur_time = cur.get("time")?.as_str()?;
    let prefix = if cur_time.len() >= 13 { &cur_time[..13] } else { cur_time };
    let times = v["hourly"]["time"].as_array()?;
    let probs = v["hourly"]["precipitation_probability"].as_array()?;
    let idx = times
        .iter()
        .position(|t| t.as_str().map(|s| s.starts_with(prefix)).unwrap_or(false))?;
    probs.get(idx).and_then(|p| p.as_f64())
}
