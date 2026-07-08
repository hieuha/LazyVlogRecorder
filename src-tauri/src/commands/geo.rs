// IP-based geolocation via ip-api.com (free, keyless). Resolves the current
// city + coordinates for the HUD location and weather/AQI lookups.

use serde::Serialize;

#[derive(Serialize)]
pub struct GeoInfo {
    pub lat: f64,
    pub lon: f64,
    pub city: String,
    pub region: String,
    pub country: String,
}

#[tauri::command]
pub async fn geo_locate() -> Result<GeoInfo, String> {
    let url =
        "http://ip-api.com/json/?fields=status,message,lat,lon,city,regionName,country";
    let resp = reqwest::get(url).await.map_err(|e| e.to_string())?;
    let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    if v.get("status").and_then(|s| s.as_str()) != Some("success") {
        return Err(v
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("geolocation failed")
            .to_string());
    }

    Ok(GeoInfo {
        lat: v["lat"].as_f64().unwrap_or(0.0),
        lon: v["lon"].as_f64().unwrap_or(0.0),
        city: v["city"].as_str().unwrap_or("").to_string(),
        region: v["regionName"].as_str().unwrap_or("").to_string(),
        country: v["country"].as_str().unwrap_or("").to_string(),
    })
}
