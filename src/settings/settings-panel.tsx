// Settings modal. Edits a working copy of AppConfig; Save persists + applies.

import { useState } from "react";
import { ChangePinFlow } from "../auth/change-pin-flow";
import type { AppConfig } from "./config-store";

interface Props {
  config: AppConfig;
  setField: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  layouts: Array<{ id: string; name: string }>;
  onBrowse: () => void;
  onClose: () => void;
  onSave: () => void;
}

export function SettingsPanel(p: Props) {
  const c = p.config;
  const [changingPin, setChangingPin] = useState(false);
  const [pinMsg, setPinMsg] = useState("");
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
          HUD LAYOUT
          <select value={c.layoutId} onChange={(e) => p.setField("layoutId", e.target.value)}>
            {p.layouts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <div className="settings-field">
          OUTPUT FOLDER
          <div className="settings-folder">
            <span className="settings-folder-path">{c.outputDir || "Movies/LazyVlogRecorder (default)"}</span>
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
        </div>

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
    </div>
  );
}
