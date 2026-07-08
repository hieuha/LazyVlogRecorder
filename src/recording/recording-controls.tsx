// Recording UI: mode toggle (FIXED / FREE), duration, Record/Stop, timer, and
// the saved-file result. Presentational — all state lives in useRecorder.

import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { RecMode } from "./use-recorder";
import type { SavedFile } from "./save-client";

interface Props {
  mode: RecMode;
  setMode: (m: RecMode) => void;
  durationSec: number;
  setDurationSec: (n: number) => void;
  recording: boolean;
  paused: boolean;
  savedFile: SavedFile | null;
  saving: boolean;
  transcodeProgress: number;
  error: string | null;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
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
            {p.saving ? "PROCESSING…" : "● REC"}
          </button>
        ) : (
          <>
            <button
              className="rec-btn pause"
              onClick={p.paused ? p.onResume : p.onPause}
            >
              {p.paused ? "▶ RESUME" : "❚❚ PAUSE"}
            </button>
            <button className="rec-btn stop" onClick={p.onStop}>
              ■ STOP
            </button>
          </>
        )}

        {p.savedFile && !p.recording && (
          <button
            className="rec-saved"
            title={`${p.savedFile.path}\nReveal in folder`}
            onClick={() => void revealItemInDir(p.savedFile!.path)}
          >
            <span className="rec-saved-label">SAVED ▸ {fmtSize(p.savedFile.size)}</span>
            <span className="rec-saved-name">{basename(p.savedFile.path)}</span>
          </button>
        )}
      </div>

      {p.error && <div className="rec-error">{p.error}</div>}
    </div>
  );
}

function basename(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
