// Settings modal. Edits a working copy of AppConfig; Save persists + applies.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isIOS } from "../platform/platform";
import { ChangePinFlow } from "../auth/change-pin-flow";
import { generateToken, type AppConfig } from "./config-store";
import { rtmpUrlWarning } from "./rtmp-url";

interface Props {
  config: AppConfig;
  setField: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  layouts: Array<{ id: string; name: string }>;
  themes: Array<{ id: string; name: string }>;
  onBrowse: () => void;
  onClose: () => void;
  onSave: () => void;
  onRegenerateToken: () => void; // regenerates + persists + restarts the server immediately
}

export function SettingsPanel(p: Props) {
  const c = p.config;
  const [changingPin, setChangingPin] = useState(false);
  const [pinMsg, setPinMsg] = useState("");
  const [showKey, setShowKey] = useState(false); // reveal the masked stream key
  // Addresses the Sensor API can bind to (loopback + wildcards + detected LAN
  // IPs), fetched from the backend so the user can pick where to expose it.
  const [bindHosts, setBindHosts] = useState<string[]>([]);
  // Confirm dialog for network-facing / destructive API Service actions.
  const [confirm, setConfirm] = useState<
    null | { title: string; body: string; onYes: () => void }
  >(null);

  useEffect(() => {
    let alive = true;
    void invoke<string[]>("list_local_ips")
      .then((ips) => alive && setBindHosts(ips))
      .catch(() => alive && setBindHosts(["127.0.0.1", "0.0.0.0"]));
    return () => {
      alive = false;
    };
  }, []);

  // Ensure the currently-saved host is selectable even if it's no longer a live
  // interface (e.g. a LAN IP from a previous network).
  const hostOptions = bindHosts.includes(c.sensorApiBindHost)
    ? bindHosts
    : [c.sensorApiBindHost, ...bindHosts];

  function hostLabel(host: string): string {
    if (host === "127.0.0.1") return "127.0.0.1 (this device only)";
    if (host === "0.0.0.0") return "0.0.0.0 (all interfaces · LAN)";
    return `${host} (LAN)`;
  }

  // Enabling/disabling the API Service opens a network endpoint — warn first.
  function askToggleApi(on: boolean) {
    setConfirm({
      title: on ? "ENABLE API SERVICE?" : "DISABLE API SERVICE?",
      body: on
        ? "Opens a local HTTP service so other apps or devices can push readings, sparklines and captions onto the HUD. Bound to a network host (0.0.0.0 or a LAN IP), anyone on your network who has the token can reach it. Applies when you press SAVE."
        : "Stops the API Service; externally‑pushed sensor data will no longer appear on the HUD. Applies when you press SAVE.",
      onYes: () => {
        p.setField("sensorApiEnabled", on);
        if (on && !c.sensorApiToken) p.setField("sensorApiToken", generateToken());
      },
    });
  }

  // Regenerating invalidates the current token immediately.
  function askRegenerate() {
    setConfirm({
      title: "REGENERATE TOKEN?",
      body: "Creates a new bearer token and applies it immediately. Any client still using the old token will be rejected until you update it.",
      onYes: () => p.onRegenerateToken(),
    });
  }
  return (
    <div className="settings-backdrop" onClick={p.onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span>SETTINGS</span>
          <button className="settings-x" onClick={p.onClose}>
            ✕
          </button>
        </div>

        <label className="settings-field">
          LOG ENTRY NAME
          <input value={c.personName} onChange={(e) => p.setField("personName", e.target.value)} />
        </label>

        <label className="settings-field">
          LOG NUMBER (next)
          <input
            type="number"
            min={1}
            value={c.logNo}
            onChange={(e) => p.setField("logNo", Math.max(1, Number(e.target.value) || 1))}
          />
        </label>

        <label className="settings-field">
          CITY OVERRIDE (blank = auto)
          <input
            value={c.cityOverride}
            placeholder="auto (IP location)"
            onChange={(e) => p.setField("cityOverride", e.target.value)}
          />
        </label>

        <label className="settings-field">
          MISSION DAY (blank = date)
          <input
            value={c.missionDayText}
            placeholder="auto (Y.M.D date)"
            maxLength={24}
            onChange={(e) => p.setField("missionDayText", e.target.value)}
          />
        </label>

        <label className="settings-field">
          FIXED DURATION (min)
          <input
            type="number"
            min={1}
            max={180}
            value={c.durationMin}
            onChange={(e) => p.setField("durationMin", Math.max(1, Number(e.target.value) || 1))}
          />
        </label>

        <label className="settings-field">
          RECORD RESOLUTION
          <select
            value={c.recordHeight}
            onChange={(e) => p.setField("recordHeight", Number(e.target.value))}
          >
            <option value={720}>720p (smaller files)</option>
            <option value={1080}>1080p (higher quality)</option>
          </select>
        </label>

        <label className="settings-field">
          HUD LAYOUT
          <select value={c.layoutId} onChange={(e) => p.setField("layoutId", e.target.value)}>
            {p.layouts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <label className="settings-field">
          HUD THEME
          <select value={c.themeId} onChange={(e) => p.setField("themeId", e.target.value)}>
            {p.themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <div className="settings-field">
          OUTPUT FOLDER
          <div className="settings-folder">
            <span className="settings-folder-path">{c.outputDir || "Movies/LazyCamHUD (default)"}</span>
            <button onClick={p.onBrowse}>Browse</button>
            {c.outputDir && <button onClick={() => p.setField("outputDir", "")}>Reset</button>}
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-check">
            <input
              type="checkbox"
              checked={c.audioEnabled}
              onChange={(e) => p.setField("audioEnabled", e.target.checked)}
            />
            RECORD AUDIO
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={c.mirror}
              onChange={(e) => p.setField("mirror", e.target.checked)}
            />
            MIRROR CAMERA
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={c.crtEffect}
              onChange={(e) => p.setField("crtEffect", e.target.checked)}
            />
            CRT EFFECT
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={c.showVitals}
              onChange={(e) => p.setField("showVitals", e.target.checked)}
            />
            SHIP VITALS
          </label>
        </div>

        <div className="settings-field">
          SENSOR API (right‑side HUD panel)
          <label className="settings-check">
            <input
              type="checkbox"
              checked={c.sensorApiEnabled}
              onChange={(e) => askToggleApi(e.target.checked)}
            />
            Enable API Service
          </label>
        </div>

        {c.sensorApiEnabled && (
          <>
            <div className="settings-api-row">
              <label className="settings-field settings-api-port">
                PORT
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={c.sensorApiPort}
                  onChange={(e) =>
                    p.setField("sensorApiPort", Math.min(65535, Math.max(1, Number(e.target.value) || 1)))
                  }
                />
              </label>
              <label className="settings-field settings-api-host">
                BIND HOST
                <select
                  value={c.sensorApiBindHost}
                  onChange={(e) => p.setField("sensorApiBindHost", e.target.value)}
                >
                  {hostOptions.map((h) => (
                    <option key={h} value={h}>
                      {hostLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="settings-field">
              TOKEN (Bearer)
              <div className="settings-folder">
                <span className="settings-folder-path">{c.sensorApiToken || "(none)"}</span>
                <button onClick={askRegenerate}>Regenerate</button>
              </div>
            </div>

          </>
        )}

        {/* Go Live / streaming is desktop-only (iOS can't spawn the ffmpeg the
            RTMP path needs), so hide the whole section — including the shared
            encoder selector — on iOS. */}
        {!isIOS && (
        <>
        <div className="settings-field">
          STREAMING (Go Live · RTMP)
          <input
            value={c.rtmpUrl}
            placeholder="rtmp://a.rtmp.youtube.com/live2"
            onChange={(e) => p.setField("rtmpUrl", e.target.value.trim())}
          />
        </div>

        <div className="settings-field">
          STREAM KEY (secret)
          <div className="settings-folder">
            <input
              className="settings-folder-path"
              type={showKey ? "text" : "password"}
              value={c.streamKey}
              placeholder="paste stream key"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => p.setField("streamKey", e.target.value.trim())}
            />
            <button onClick={() => setShowKey((v) => !v)}>{showKey ? "Hide" : "Show"}</button>
          </div>
          {rtmpUrlWarning(c.rtmpUrl, c.streamKey) && (
            <div className="settings-hint settings-warn">⚠ {rtmpUrlWarning(c.rtmpUrl, c.streamKey)}</div>
          )}
        </div>

        <label className="settings-check">
          <input
            type="checkbox"
            checked={c.saveLocalWhileLive}
            onChange={(e) => p.setField("saveLocalWhileLive", e.target.checked)}
          />
          Save copy locally while live
        </label>

        <div className="settings-row">
          <label className="settings-field">
            STREAM FPS
            <select
              value={c.streamFps}
              onChange={(e) => p.setField("streamFps", Number(e.target.value))}
            >
              <option value={24}>24</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </label>
          <label className="settings-field">
            BITRATE (kbps)
            <input
              type="number"
              min={500}
              max={12000}
              step={500}
              value={c.streamBitrateKbps}
              onChange={(e) =>
                p.setField(
                  "streamBitrateKbps",
                  Math.min(12000, Math.max(500, Number(e.target.value) || 4500)),
                )
              }
            />
          </label>
        </div>

        <label className="settings-field">
          ENCODER (stream + record)
          <select
            value={c.streamEncoder}
            onChange={(e) => p.setField("streamEncoder", e.target.value as AppConfig["streamEncoder"])}
          >
            <option value="auto">Auto — hardware if available (recommended)</option>
            <option value="hardware">Hardware — VideoToolbox (low CPU)</option>
            <option value="software">Software — libx264 / VP8 (compatible)</option>
          </select>
        </label>
        <div className="settings-hint">
          The stream uses your record resolution. Lower FPS / bitrate (or record at 720p)
          if the stream stutters. Match bitrate to your upload speed (720p≈4500,
          1080p≈6000). The local copy stays full quality.
        </div>
        </>
        )}

        <div className="settings-field">
          SECURITY
          <div className="settings-folder">
            <button onClick={() => setChangingPin(true)}>Change PIN</button>
            {pinMsg && <span className="settings-folder-path">{pinMsg}</span>}
          </div>
        </div>

        {changingPin && (
          <ChangePinFlow
            onClose={() => setChangingPin(false)}
            onDone={() => {
              setChangingPin(false);
              setPinMsg("PIN updated ✓");
            }}
          />
        )}

        <div className="settings-actions">
          <button className="settings-cancel" onClick={p.onClose}>
            CANCEL
          </button>
          <button className="settings-save" onClick={p.onSave}>
            SAVE
          </button>
        </div>
      </div>

      {confirm && (
        <div
          className="settings-backdrop"
          onClick={(e) => {
            e.stopPropagation();
            setConfirm(null);
          }}
        >
          <div
            className="settings-modal settings-confirm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-head">
              <span>{confirm.title}</span>
            </div>
            <p className="settings-confirm-body">{confirm.body}</p>
            <div className="settings-actions">
              <button className="settings-cancel" onClick={() => setConfirm(null)}>
                CANCEL
              </button>
              <button
                className="settings-save"
                onClick={() => {
                  confirm.onYes();
                  setConfirm(null);
                }}
              >
                CONFIRM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
