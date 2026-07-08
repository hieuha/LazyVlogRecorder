// Frontend wrapper for the Rust geo_locate command (IP geolocation).

import { invoke } from "@tauri-apps/api/core";

export interface GeoInfo {
  lat: number;
  lon: number;
  city: string;
  region: string;
  country: string;
}

export function geoLocate(): Promise<GeoInfo> {
  return invoke<GeoInfo>("geo_locate");
}

/** Forward-geocode a "city" or "city, country" query to coordinates. */
export function geocodeCity(query: string): Promise<GeoInfo> {
  return invoke<GeoInfo>("geocode_city", { query });
}
