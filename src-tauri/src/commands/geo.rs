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

/// Forward geocode a "city" or "city, country" query to coordinates via
/// Open-Meteo Geocoding (free, keyless). Used for the city override so weather
/// follows the chosen place.
#[tauri::command]
pub async fn geocode_city(query: String) -> Result<GeoInfo, String> {
    let name = query.split(',').next().unwrap_or(&query).trim();
    if name.is_empty() {
        return Err("empty city query".into());
    }
    let url = format!(
        "https://geocoding-api.open-meteo.com/v1/search?name={}&count=1&language=en&format=json",
        urlencoding(name)
    );
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let r = v["results"].get(0).ok_or("city not found")?;

    Ok(GeoInfo {
        lat: r["latitude"].as_f64().unwrap_or(0.0),
        lon: r["longitude"].as_f64().unwrap_or(0.0),
        city: r["name"].as_str().unwrap_or(name).to_string(),
        region: r["admin1"].as_str().unwrap_or("").to_string(),
        country: r["country"].as_str().unwrap_or("").to_string(),
    })
}

fn urlencoding(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            ' ' => "%20".to_string(),
            other => other
                .to_string()
                .bytes()
                .map(|b| format!("%{b:02X}"))
                .collect(),
        })
        .collect()
}
