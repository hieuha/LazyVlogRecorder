#!/usr/bin/env node
// Mock radiosonde (weather-balloon) telemetry generator for the LazyCamHUD
// sensor API. Simulates a SondeHub-style flight — ascent, burst, parachute
// descent — and continuously pushes readings:
//   POST /sensors : LAT, LON, DIST, BATT (scalar readouts, right panel)
//   POST /series  : ALT, SPD (time series → sparklines)
//
// Usage:
//   node scripts/mock-sonde.mjs <TOKEN> [baseUrl]
//   SONDE_TOKEN=<token> SONDE_URL=http://127.0.0.1:1337 node scripts/mock-sonde.mjs
// The token is the Sensor API bearer token shown in Settings.

const TOKEN = process.env.SONDE_TOKEN || process.argv[2] || "";
const BASE = (process.env.SONDE_URL || process.argv[3] || "http://127.0.0.1:1337").replace(/\/$/, "");
const INTERVAL = Number(process.env.SONDE_INTERVAL || 1000); // ms between pushes

if (!TOKEN) {
  console.error("Usage: node scripts/mock-sonde.mjs <TOKEN> [baseUrl]");
  console.error("  (or set SONDE_TOKEN; get the token from Settings → Sensor API)");
  process.exit(1);
}

// Launch + observer position (distance is measured from here). Hanoi.
const HOME = { lat: 21.0278, lon: 105.8342 };
const BURST_ALT = 32000; // m
const ASCENT = 5; // m/s

const s = {
  lat: HOME.lat,
  lon: HOME.lon,
  alt: 15, // m
  batt: 100, // %
  phase: "ascent", // ascent → descent → landed
};

const dt = INTERVAL / 1000;
const jitter = (a) => (Math.random() * 2 - 1) * a;

// Great-circle distance (km) between two lat/lon points.
function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s1 = Math.sin(dLat / 2) ** 2 +
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

function step() {
  // Vertical profile: climb, then fall faster up high (thin air), slower low.
  let climb;
  if (s.phase === "ascent") {
    climb = ASCENT + jitter(0.6);
    if (s.alt >= BURST_ALT) s.phase = "descent";
  } else if (s.phase === "descent") {
    climb = -(6 + 34 * (s.alt / BURST_ALT)) + jitter(1); // -40 up high → -6 near ground
  } else {
    climb = 0;
  }
  s.alt = Math.max(0, s.alt + climb * dt);
  if (s.phase === "descent" && s.alt <= 0) s.phase = "landed";

  // Horizontal wind drift (east-north-east), stronger with altitude.
  const wind = 8 + (s.alt / BURST_ALT) * 22; // m/s
  const vx = wind * 0.8 + jitter(3); // east
  const vy = wind * 0.4 + jitter(3); // north
  s.lat += (vy * dt) / 111320;
  s.lon += (vx * dt) / (111320 * Math.cos((s.lat * Math.PI) / 180));

  s.batt = Math.max(0, s.batt - 0.01 * dt - Math.max(0, jitter(0.005)));

  const speed = Math.hypot(vx, vy);
  const dist = haversineKm(HOME, { lat: s.lat, lon: s.lon });
  return { climb, speed, dist };
}

let ticks = 0;
const NAME = "MOCK SONDE · HANOI";

async function tick() {
  const { climb, speed, dist } = step();
  ticks++;

  // Re-announce the name periodically so a late-enabled app still gets it.
  if (ticks % 60 === 1) void post("/text", { text: NAME });

  const scalars = post("/sensors", {
    items: [
      { label: "LAT", value: s.lat.toFixed(4) },
      { label: "LON", value: s.lon.toFixed(4) },
      { label: "DIST", value: dist.toFixed(1), unit: "km" },
      { label: "BATT", value: s.batt.toFixed(0), unit: "%" },
    ],
  });
  const alt = post("/series", { label: "ALT", value: Math.round(s.alt), unit: "m" });
  const spd = post("/series", { label: "SPD", value: Number(speed.toFixed(1)), unit: "m/s" });
  const [rs, ra] = await Promise.all([scalars, alt, spd]).then((r) => [r[0], r[1]]);

  process.stdout.write(
    `\r#${String(ticks).padStart(4)} ${s.phase.padEnd(7)} ` +
      `alt ${String(Math.round(s.alt)).padStart(6)}m climb ${climb.toFixed(1).padStart(6)} ` +
      `dist ${dist.toFixed(1).padStart(6)}km batt ${s.batt.toFixed(0).padStart(3)}% ` +
      `[sensors ${rs} series ${ra}]   `,
  );
}

console.log(`Mock sonde → ${BASE}  (every ${INTERVAL}ms; Ctrl+C to stop)`);
await tick();
const timer = setInterval(tick, INTERVAL);
process.on("SIGINT", () => {
  clearInterval(timer);
  console.log("\nstopped.");
  process.exit(0);
});
