// Recording + Go-Live UI: destination toggle (LOCAL / LIVE), mode toggle
// (FIXED / FREE), duration, and the primary action (● REC or ◉ GO LIVE / ■ STOP).
// Presentational — all state lives in useRecorder / useStreaming. The timer +
// LIVE/REC badges live in the top-right (see App).

import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { RecMode } from "./use-recorder";
import type { SavedFile } from "./save-client";

export type Destination = "local" | "live";

interface Props {
  mode: RecMode;
  setMode: (m: RecMode) => void;
  durationSec: number;
  setDurationSec: (n: number) => void;
  recording: boolean; // local recording active
  live: boolean; // streaming active
  paused: boolean;
  savedFile: SavedFile | null;
  saving: boolean;
  transcodeProgress: number;
  error: string | null;
  disabled: boolean;
  // Go Live
  destination: Destination;
  setDestination: (d: Destination) => void;
  streamConfigured: boolean;
  saveLocalWhileLive: boolean;
  setSaveLocalWhileLive: (v: boolean) => void;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onGoLive: () => void;
  onStopLive: () => void;
  onOpenSettings: () => void; // hint target when streaming isn't configured
}

export function RecordingControls(p: Props) {
  const idle = !p.recording && !p.live;
  return (
    <div className="rec-panel">
      <div className="rec-row">
        {idle && (
          <div className="rec-toggle dest-toggle" data-dest={p.destination}>
            <button
              className={`seg ${p.destination === "local" ? "active" : ""}`}
              onClick={() => p.setDestination("local")}
            >
              LOCAL
            </button>
            <button
              className={`seg ${p.destination === "live" ? "active" : ""}`}
              onClick={() => p.setDestination("live")}
            >
              LIVE
            </button>
          </div>
        )}

        {idle && (
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
        {idle && p.mode === "fixed" && (
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

        {/* Primary action. */}
        {idle && p.destination === "local" && (
          <button className="rec-btn start" onClick={p.onStart} disabled={p.disabled || p.saving}>
            {p.saving ? "PROCESSING…" : "● REC"}
          </button>
        )}
        {/* LIVE destination, idle: GO LIVE (gated) + save-local checkbox to its right. */}
        {idle && p.destination === "live" && (
          <button
            className={`rec-btn go-live ${p.streamConfigured ? "" : "gated"}`}
            onClick={p.streamConfigured ? p.onGoLive : p.onOpenSettings}
            disabled={p.disabled}
            title={p.streamConfigured ? "Broadcast to your RTMP destination" : "Set RTMP URL + key in Settings"}
          >
            {p.streamConfigured ? "◉ GO LIVE" : "◉ SET UP"}
          </button>
        )}
        {idle && p.destination === "live" && (
          <label className="rec-save-local">
            <input
              type="checkbox"
              checked={p.saveLocalWhileLive}
              onChange={(e) => p.setSaveLocalWhileLive(e.target.checked)}
            />
            SAVE LOCAL
          </label>
        )}

        {/* Local recording in progress. */}
        {p.recording && (
          <>
            <button className="rec-btn pause" onClick={p.paused ? p.onResume : p.onPause}>
              {p.paused ? "▶ RESUME" : "❚❚ PAUSE"}
            </button>
            <button className="rec-btn stop" onClick={p.onStop}>
              ■ STOP
            </button>
          </>
        )}

        {/* Live in progress — no pause while broadcasting. */}
        {p.live && (
          <button className="rec-btn stop" onClick={p.onStopLive}>
            ■ END LIVE
          </button>
        )}

        {p.savedFile && idle && (
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
