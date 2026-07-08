#!/usr/bin/env node
// Replay a real radiosonde auto_rx CSV log (e.g. RS41) into the LazyCamHUD
// sensor API, pacing rows by their real timestamps. Pushes:
//   POST /sensors : LAT, LON, DIST, TEMP, BATT, SATS   (scalar readouts)
//   POST /series  : ALT, CLIMB                          (sparklines)
//
// Log header expected (auto_rx):
//   timestamp,serial,frame,lat,lon,alt,vel_v,vel_h,heading,temp,humidity,
//   pressure,type,freq_mhz,snr,f_error_hz,sats,batt_v,burst_timer,aux_data
//
// Usage:
//   node scripts/replay-sonde-log.mjs <logfile> <TOKEN> [baseUrl]
// Env: SONDE_TOKEN, SONDE_URL, SONDE_SPEED (time multiplier, default 1 = real
//      time), SONDE_LOOP=1 (repeat from the start when the log ends).

import { readFileSync } from "node:fs";

const LOG = process.argv[2] || process.env.SONDE_LOG;
const TOKEN = process.env.SONDE_TOKEN || process.argv[3] || "";
const BASE = (process.env.SONDE_URL || process.argv[4] || "http://127.0.0.1:1337").replace(/\/$/, "");
const SPEED = Math.max(0.1, Number(process.env.SONDE_SPEED || 1)); // >1 = faster than real time
const LOOP = process.env.SONDE_LOOP === "1";

if (!LOG || !TOKEN) {
  console.error("Usage: node scripts/replay-sonde-log.mjs <logfile> <TOKEN> [baseUrl]");
  console.error("  TOKEN = Sensor API bearer token (Settings → Sensor API)");
  process.exit(1);
}

// --- Parse the CSV into rows keyed by header name. ---
const lines = readFileSync(LOG, "utf8").split(/\r?\n/).filter((l) => l.trim());
const header = lines[0].split(",");
const idx = (name) => header.indexOf(name);
const col = {
  ts: idx("timestamp"),
  serial: idx("serial"),
  lat: idx("lat"),
  lon: idx("lon"),
  alt: idx("alt"),
  vv: idx("vel_v"),
  temp: idx("temp"),
  type: idx("type"),
  sats: idx("sats"),
  batt: idx("batt_v"),
};
const rows = lines.slice(1).map((l) => l.split(","));
if (!rows.length) {
  console.error("no data rows in log");
  process.exit(1);
}

const home = { lat: Number(rows[0][col.lat]), lon: Number(rows[0][col.lon]) };

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s1 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s1), Math.sqrt(1 - s1));
}

async function post(path, body) {
  try {
    const r = await fetch(BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(body),
    });
    return String(r.status);
  } catch (e) {
    return `ERR ${e.cause?.code || e.message}`;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pushRow(r) {
  const lat = Number(r[col.lat]);
  const lon = Number(r[col.lon]);
  const alt = Number(r[col.alt]);
  const vv = Number(r[col.vv]);
  const temp = Number(r[col.temp]);
  const sats = r[col.sats];
  const batt = Number(r[col.batt]);
  const dist = haversineKm(home, { lat, lon });

  const items = [
    { label: "LAT", value: lat.toFixed(5) },
    { label: "LON", value: lon.toFixed(5) },
    { label: "DIST", value: dist.toFixed(1), unit: "km" },
    // temp/humidity read -273/-1 until the RS41 sensor boom deploys.
    { label: "TEMP", value: temp > -100 ? temp.toFixed(1) : "--", unit: temp > -100 ? "C" : "" },
    { label: "BATT", value: Number.isFinite(batt) ? batt.toFixed(1) : "--", unit: "V" },
    { label: "SATS", value: sats || "--" },
  ];

  const [s1, s2] = await Promise.all([
    post("/sensors", { items }),
    post("/series", { label: "ALT", value: Math.round(alt), unit: "m" }),
    post("/series", { label: "CLIMB", value: Number(vv.toFixed(1)), unit: "m/s" }),
  ]);
  return { alt, dist, temp, s1, s2 };
}

async function run() {
  console.log(`Replay ${rows.length} rows → ${BASE}  (speed ${SPEED}x${LOOP ? ", looping" : ""}; Ctrl+C to stop)`);
  // Announce the sonde name/serial as a typewriter caption; re-send periodically
  // so a late-started/late-enabled app still receives it.
  const name = `${rows[0][col.type] || "SONDE"} · ${rows[0][col.serial] || "?"}`;
  console.log(`[text] ${name} → ${await post("/text", { text: name })}`);
  do {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (i > 0 && i % 60 === 0) await post("/text", { text: name });
      const { alt, dist, temp, s1, s2 } = await pushRow(r);
      process.stdout.write(
        `\r${String(i + 1).padStart(4)}/${rows.length}  ` +
          `alt ${String(Math.round(alt)).padStart(6)}m  dist ${dist.toFixed(1).padStart(6)}km  ` +
          `temp ${temp > -100 ? temp.toFixed(1) : "--"}  [sensors ${s1} series ${s2}]     `,
      );
      // Pace by the gap to the next row's timestamp (clamped), scaled by SPEED.
      if (i + 1 < rows.length) {
        const gap = Date.parse(rows[i + 1][col.ts]) - Date.parse(r[col.ts]);
        await sleep(Math.min(5000, Math.max(0, (Number.isFinite(gap) ? gap : 1000) / SPEED)));
      }
    }
    if (LOOP) console.log("\n-- loop --");
  } while (LOOP);
  console.log("\ndone.");
}

process.on("SIGINT", () => {
  console.log("\nstopped.");
  process.exit(0);
});

run();
