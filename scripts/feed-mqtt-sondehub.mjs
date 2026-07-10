#!/usr/bin/env node
// Feed a LIVE radiosonde from SondeHub (sondehub.org) into the LazyCamHUD sensor
// API in real time, so you can record the HUD while a balloon is flying.
//
// Uses SondeHub's realtime MQTT-over-WebSocket feed (frames are PUSHED as they
// arrive — no polling). Requires the `mqtt` package (npm install mqtt). Pushes:
//   POST /sensors : LAT, LON, DIST, TEMP, BATT, SATS   (scalar readouts)
//   POST /series  : ALT, CLIMB                          (sparklines)
//   POST /text    : rotating mission-control captions
//
// Broker  : wss://ws-reader.v2.sondehub.org/  (anonymous, read-only)
// Topic   : sondes/<serial>  → JSON telemetry frame (same schema as the REST API)
//
// Usage:
//   node scripts/feed-mqtt-sondehub.mjs <TOKEN> [serial]
//   node --env-file=.env scripts/feed-mqtt-sondehub.mjs [serial]   (see .env.example)
//   TOKEN  = Sensor API bearer token (Settings → Sensor API)
//   serial = SondeHub serial, e.g. Y0322354 (default below)
// Env: SONDE_TOKEN, SONDE_URL (default http://127.0.0.1:1337), SONDE_SERIAL,
//      SONDE_BROKER (override MQTT URL), HOME_LAT / HOME_LON (DIST origin).

import mqtt from "mqtt";

// Positional args are consumed left-to-right, but only for values not already
// supplied via env — so `--env-file=.env <serial>` treats the first positional
// as the serial (token comes from env), while `<TOKEN> <serial>` still works.
const argv = process.argv.slice(2);
const TOKEN = process.env.SONDE_TOKEN || argv.shift() || "";
const SERIAL = process.env.SONDE_SERIAL || argv.shift() || "Y0322354";
const BASE = (process.env.SONDE_URL || "http://127.0.0.1:1337").replace(/\/$/, "");
const BROKER = process.env.SONDE_BROKER || "wss://ws-reader.v2.sondehub.org/";

if (!TOKEN) {
  console.error("Usage: node scripts/feed-mqtt-sondehub.mjs <TOKEN> [serial]");
  console.error("  TOKEN  = Sensor API bearer token (Settings → Sensor API)");
  console.error("  serial = SondeHub serial (default Y0322354)");
  process.exit(1);
}

// DIST origin. Supply your ground station via env HOME_LAT / HOME_LON — kept out
// of source so your location is never committed. If unset, DIST is measured from
// the first frame observed.
let home =
  Number.isFinite(Number(process.env.HOME_LAT)) && Number.isFinite(Number(process.env.HOME_LON))
    ? { lat: Number(process.env.HOME_LAT), lon: Number(process.env.HOME_LON) }
    : null;

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

// --- Flavour captions: mission-control style, carrying the live numbers. ---
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
let maxAltSeen = 0;

function caption(f) {
  const alt = Number(f.alt);
  const vv = Number(f.vel_v);
  const dist = haversineKm(home, { lat: Number(f.lat), lon: Number(f.lon) });
  const type = f.type || "SONDE";
  const serial = f.serial || SERIAL;
  maxAltSeen = Math.max(maxAltSeen, alt);
  const descending = vv < -0.5;
  const burst = descending && maxAltSeen - alt > 300 && maxAltSeen > 5000;

  const dir = descending ? "DN" : "UP";
  const dataLine = `${type} · ${serial} · ${Math.round(alt)}M · ${dir} ${Math.abs(vv).toFixed(1)}M/S · ${dist.toFixed(1)}KM`;

  if (burst) return pick([`*** BURST · ${Math.round(alt)}M ***`, `BALLOON BURST · DESCENDING ${Math.abs(vv).toFixed(0)}M/S`]);
  if (descending) {
    return pick([
      dataLine,
      `DESCENDING · ${Math.abs(vv).toFixed(0)}M/S · ${dist.toFixed(1)}KM`,
      `RECOVERY MODE · ${Math.round(alt)}M`,
      `TRACKING DESCENT · ${f.sats} SATS`,
    ]);
  }
  const ascent = [
    dataLine,
    dataLine, // weight the data line so it shows most often
    `ASCENDING · ${vv.toFixed(1)}M/S · ${Math.round(alt)}M`,
    `GPS ${f.sats} SATS · SNR ${f.snr}dB · ${dist.toFixed(1)}KM`,
    `${type} ${serial} · ${(Number(f.frequency) || 0).toFixed(3)}MHZ`,
  ];
  if (alt > 15000) ascent.push(`STRATOSPHERE · ${Math.round(alt)}M`, "APPROACHING BURST ALT");
  return pick(ascent);
}

async function pushScalars(f) {
  const lat = Number(f.lat);
  const lon = Number(f.lon);
  const dist = haversineKm(home, { lat, lon });
  const temp = Number(f.temp);
  const batt = Number(f.batt);
  const items = [
    { label: "LAT", value: lat.toFixed(5) },
    { label: "LON", value: lon.toFixed(5) },
    { label: "DIST", value: dist.toFixed(1), unit: "km" },
    // temp/humidity are absent until the RS41 sensor boom deploys.
    { label: "TEMP", value: Number.isFinite(temp) && temp > -100 ? temp.toFixed(1) : "--", unit: Number.isFinite(temp) && temp > -100 ? "C" : "" },
    { label: "BATT", value: Number.isFinite(batt) ? batt.toFixed(1) : "--", unit: "V" },
    // Sensor API requires every item value to be a string; f.sats is numeric.
    { label: "SATS", value: String(f.sats ?? "--") },
  ];
  return post("/sensors", { items });
}

function pushSeries(f) {
  return Promise.all([
    post("/series", { label: "ALT", value: Math.round(Number(f.alt)), unit: "m" }),
    post("/series", { label: "CLIMB", value: Number(Number(f.vel_v).toFixed(1)), unit: "m/s" }),
  ]);
}

// --- Realtime MQTT subscribe. Frames arrive ~2/s; drop dups/out-of-order by
// datetime (multiple receivers upload overlapping frames). Sparkline gets every
// forward frame; the typewriter caption is throttled so it isn't retriggered too fast.
let lastTs = 0;
let captionAt = 0;
const CAPTION_EVERY_MS = 4000;
let pushing = false; // coalesce: skip a frame while a push is still in flight

// Liveness ticker: a push feed has no fixed "next update", so instead show the
// age of the last frame (ticking up every second) and flag STALE if the feed
// goes quiet — that's the useful signal while recording.
let lastFrameAt = 0; // wall-clock ms of the last accepted frame
let lastMetrics = ""; // rendered metrics of the last frame, redrawn by the ticker
const STALE_MS = 15000;

function render() {
  if (!lastFrameAt) return;
  const age = Math.round((Date.now() - lastFrameAt) / 1000);
  const tag = Date.now() - lastFrameAt > STALE_MS ? "STALE" : `${age}s ago`;
  process.stdout.write(`\r${lastMetrics}  ·  updated ${tag}      `);
}

async function onFrame(f) {
  const ts = Date.parse(f.datetime);
  if (!Number.isFinite(ts) || ts <= lastTs) return; // dup or stale straggler
  lastTs = ts;
  if (!home) home = { lat: Number(f.lat), lon: Number(f.lon) }; // fallback origin
  if (pushing) return; // don't queue behind a slow local POST
  pushing = true;
  try {
    const tasks = [pushSeries(f), pushScalars(f)];
    if (Date.now() - captionAt > CAPTION_EVERY_MS) {
      captionAt = Date.now();
      tasks.push(post("/text", { text: caption(f) }));
    }
    await Promise.all(tasks);
    const dist = haversineKm(home, { lat: Number(f.lat), lon: Number(f.lon) });
    lastFrameAt = Date.now();
    lastMetrics =
      `alt ${String(Math.round(Number(f.alt))).padStart(6)}m  ` +
      `climb ${Number(f.vel_v).toFixed(1).padStart(6)}m/s  ` +
      `dist ${dist.toFixed(1).padStart(6)}km  sats ${f.sats}  ${new Date(ts).toISOString().slice(11, 19)}`;
    render();
  } finally {
    pushing = false;
  }
}

// Redraw once a second so the "updated Xs ago" age advances between frames.
setInterval(render, 1000).unref();

const client = mqtt.connect(BROKER, {
  reconnectPeriod: 2000,
  connectTimeout: 15000,
  clientId: "SondeHub-Tracker-" + Math.random().toString(16).slice(2, 10),
});

client.on("connect", () => {
  // (Re)subscribe on every (re)connect so recovery is automatic.
  client.subscribe(`sondes/${SERIAL}`, (err) =>
    console.log(err ? `\nsubscribe error: ${err.message}` : `\nlive: subscribed sondes/${SERIAL} → ${BASE}`),
  );
});
client.on("reconnect", () => process.stdout.write("\r[mqtt] reconnecting…                                  "));
client.on("error", (e) => console.log(`\n[mqtt] ${e.code || e.message}`));
client.on("message", (_topic, payload) => {
  let f;
  try {
    f = JSON.parse(payload.toString());
  } catch {
    return;
  }
  void onFrame(f);
});

console.log(`SondeHub realtime → ${BASE}   serial ${SERIAL}   (Ctrl+C to stop)`);
post("/text", { text: `SONDE · ${SERIAL}` }).then((s) => console.log(`[text] ${s}`));

process.on("SIGINT", () => {
  console.log("\nstopped.");
  client.end(true, () => process.exit(0));
  setTimeout(() => process.exit(0), 1000);
});
