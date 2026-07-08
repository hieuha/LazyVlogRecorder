# Sensor API — LazyCamHUD

Push your own sensor data into the HUD over a local HTTP endpoint. Everything you
send is drawn on the right side of the HUD **and burned into the recorded MP4**
(the panels are canvas widgets, same as the weather gauges).

Three endpoints:

- `POST /sensors` — scalar readouts (a labelled value column, top‑right).
- `POST /series` — numeric time series, drawn as a **sparkline** (mid‑right).
- `POST /text` — a free‑text caption with a **typewriter** effect (bottom‑center).

## Enable

**Settings → Sensor API → Enable HTTP endpoint.** Then configure:

| Setting | Meaning |
|---|---|
| **Port** | TCP port (default `1337`). |
| **Allow LAN devices** | On → bind `0.0.0.0` (reachable from other devices on the network). Off → bind `127.0.0.1` (this machine only). |
| **Token** | Bearer token, auto‑generated; **Regenerate** makes a new one. |

The server starts when you save and enable, restarts when you change these, and
stops when the app is locked or closed.

## Authentication

Send the token as a bearer header:

```
Authorization: Bearer <token>
```

- **LAN mode requires** a non‑empty token — every request is checked.
- Localhost mode: if the token is empty the check is skipped; otherwise it is required.

## `POST /sensors` — scalar readouts

```bash
curl -X POST http://127.0.0.1:1337/sensors \
  -H "Authorization: Bearer <token>" \
  -d '{"items":[
        {"label":"CO2","value":"812","unit":"ppm"},
        {"label":"HR","value":"78","unit":"bpm"}
      ]}'
```

- Body: `{ "items": [ { "label": string, "value": string, "unit"?: string } ] }`
- Rendered as `LABEL … VALUE unit` rows, right‑aligned, top‑right.
- Latest push replaces the previous set. Rows **dim after ~10 s** without an update.

## `POST /series` — time series (sparkline)

```bash
curl -X POST http://127.0.0.1:1337/series \
  -H "Authorization: Bearer <token>" \
  -d '{"label":"ALT","value":12345,"unit":"m"}'
```

- Body: `{ "label": string, "value": number, "unit"?: string }` — **one point per call**.
- The app keeps a rolling buffer of the **last ~120 points per `label`** and draws a
  mini line chart: x = time (sample order), y = value, auto‑scaled to the buffer's
  min/max, with a dot on the latest point. Row shows `LABEL <line> VALUE unit`.
- Keep POSTing the current value at your own cadence; the app builds the curve.

## `POST /text` — caption (typewriter)

```bash
curl -X POST http://127.0.0.1:1337/text \
  -H "Authorization: Bearer <token>" \
  -d '{"text":"RS41 · Y0532363","typing":true}'
```

- Body: `{ "text": string, "typing"?: boolean }` (`typing` defaults to `true`).
- Drawn left‑aligned just below the location line; characters reveal at ~25/sec
  with a blinking cursor. A new push restarts the reveal. Set `"typing":false` to
  show it instantly. Text is truncated to **120 chars**.
- **Idle fallback:** with no caption in the last ~12 s, the slot shows a decorative
  random hex stream (e.g. `0x4F2A 0x9C11 …`) so it never looks empty.

## Responses

Every response is JSON:

| Status | Body | When |
|---|---|---|
| `200` | `{"ok":true,"count":N}` (/sensors) · `{"ok":true}` (/series) | accepted |
| `400` | `{"ok":false,"error":"bad json"}` / `"value not finite"` | malformed body |
| `401` | `{"ok":false,"error":"unauthorized"}` | missing/wrong token |
| `413` | `{"ok":false,"error":"too large"}` | body over the limit |
| `404` | `{"ok":false,"error":"not found"}` | wrong method/path |

Add `-i` to `curl` to also see the HTTP status line.

## Limits

- `/sensors`: ≤ **6 items**; `label`/`value`/`unit` truncated to **12 / 10 / 6** chars.
- `/series`: ≤ **120 points** kept per label (older points drop off).
- `/text`: caption truncated to **120 chars**.
- Body ≤ **8 KB**. Values are display text only — **nothing is executed**.

## Simulation scripts (weather‑balloon concept)

Two zero‑dependency Node scripts (Node 18+) are bundled to feed the API with
realistic radiosonde telemetry — handy for demos and for testing the panels.

### Quick test (copy‑paste)

1. Run the app (`npm run tauri dev`), then **Settings → Sensor API → Enable** and copy the **token**.
2. Feed it — either the synthetic flight or a real log:

```bash
# synthetic flight (no data file needed)
node scripts/mock-sonde.mjs <token>

# replay a real auto_rx RS41 log (example, faster than real time + looping)
SONDE_SPEED=20 SONDE_LOOP=1 \
  node scripts/replay-sonde-log.mjs scripts/20260708-115249_Y0532363_RS41_403000_sonde.log <token>
```

`<token>` is the Sensor API token from Settings. Pass the log path as the first
arg (absolute, or relative to where you run the command). Add `SONDE_URL=...` to
target another machine/port. Watch the readouts, sparklines and typewriter caption
appear on the HUD (and in the recording).

### `scripts/mock-sonde.mjs` — synthetic flight

Generates a flight from scratch: ascent at ~5 m/s → **burst at ~32 km** →
parachute descent (faster up high, slower low), with wind drift and battery drain.
No input data needed.

```bash
node scripts/mock-sonde.mjs <token>                 # → http://127.0.0.1:1337
SONDE_URL=http://192.168.1.20:1337 SONDE_INTERVAL=1000 \
  node scripts/mock-sonde.mjs <token>
```

Pushes a name caption once (`/text` → "MOCK SONDE · HANOI"), then each second:

- `/sensors`: `LAT`, `LON`, `DIST` (km from launch), `BATT` (%).
- `/series`: `ALT` (m), `SPD` (horizontal m/s).

### `scripts/replay-sonde-log.mjs` — replay a real log

Replays a real [auto_rx](https://github.com/projecthorus/radiosonde_auto_rx)
CSV log (e.g. an RS41) row‑by‑row, paced by the rows' own timestamps. A sample log
is bundled at `scripts/20260708-115249_Y0532363_RS41_403000_sonde.log`.

Expected header:
`timestamp,serial,frame,lat,lon,alt,vel_v,vel_h,heading,temp,humidity,pressure,type,freq_mhz,snr,f_error_hz,sats,batt_v,burst_timer,aux_data`

```bash
node scripts/replay-sonde-log.mjs <logfile> <token>          # real time (1 Hz)
SONDE_SPEED=20 node scripts/replay-sonde-log.mjs <logfile> <token>   # 20× faster
SONDE_LOOP=1  node scripts/replay-sonde-log.mjs <logfile> <token>    # repeat
```

Pushes the sonde name once (`/text` → `<type> · <serial>`, e.g. "RS41 · Y0532363"),
then per row:

- `/sensors`: `LAT`, `LON`, `DIST` (from the first row = launch site), `TEMP`
  (`--` until the RS41 sensor boom deploys, i.e. while `temp` reads `-273`), `BATT`
  (V), `SATS`.
- `/series`: `ALT` (m), `CLIMB` (`vel_v`, m/s).

**Env vars:** `SONDE_TOKEN`, `SONDE_URL`, `SONDE_INTERVAL` (mock), `SONDE_SPEED`
(replay time multiplier), `SONDE_LOOP=1` (replay).

## Security notes

- The endpoint accepts **display text only**; there is no code path that executes it.
- Size/count/length are clamped so a device cannot overflow the HUD or memory.
- LAN binding requires a token; treat the token like a shared password on your network.
- The token lives in `config.json` alongside other settings (not a secret store).
