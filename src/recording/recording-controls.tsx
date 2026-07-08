// Recording UI: mode toggle (FIXED / FREE), duration, Record/Stop, timer, and
// the saved-file result. Presentational — all state lives in useRecorder.

import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { RecMode } from "./use-recorder";

interface Props {
  mode: RecMode;
  setMode: (m: RecMode) => void;
  durationSec: number;
  setDurationSec: (n: number) => void;
  recording: boolean;
  savedPath: string | null;
  saving: boolean;
  error: string | null;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}

// Timer + REC indicator live in the top-right badge (see App); this panel only
// holds mode selection and the Record/Stop control.
export function RecordingControls(p: Props) {
  return (
    <div className="rec-panel">
      <div className="rec-row">
        {!p.recording && (
          <div className="rec-toggle" data-mode={p.mode}>
            <button
              className={`seg ${p.mode === "fixed" ? "active" : ""}`}
              onClick={() => p.setMode("fixed")}
            >
              FIXED
            </button>
            <button
              className={`seg ${p.mode === "free" ? "active" : ""}`}
              onClick={() => p.setMode("free")}
            >
              FREE
            </button>
          </div>
        )}
        {!p.recording && p.mode === "fixed" && (
          <label className="rec-duration">
            MIN
            <input
              type="number"
              min={1}
              max={180}
              value={Math.round(p.durationSec / 60)}
              onChange={(e) => p.setDurationSec(Math.max(1, Number(e.target.value) || 1) * 60)}
            />
          </label>
        )}
        {!p.recording ? (
          <button className="rec-btn start" onClick={p.onStart} disabled={p.disabled || p.saving}>
            {p.saving ? "SAVING…" : "● REC"}
          </button>
        ) : (
          <button className="rec-btn stop" onClick={p.onStop}>
            ■ STOP
          </button>
        )}
      </div>

      {p.error && <div className="rec-error">{p.error}</div>}
      {p.savedPath && !p.recording && (
        <button
          className="rec-saved"
          title="Reveal in folder"
          onClick={() => void revealItemInDir(p.savedPath!)}
        >
          <span className="rec-saved-label">SAVED ▸</span>
          <span className="rec-saved-path">{p.savedPath}</span>
        </button>
      )}
    </div>
  );
}
