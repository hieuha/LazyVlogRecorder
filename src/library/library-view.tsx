// Log Library: grid of recorded entries with thumbnails, in-app playback,
// reveal-in-folder, and delete (file + thumbnail + index record).

import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { listEntries, removeEntry, type Entry } from "./entries-store";
import { deleteFiles } from "./library-client";
import "./library-view.css";

export function LibraryView({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [playing, setPlaying] = useState<Entry | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function refresh() {
    setEntries(await listEntries());
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function doDelete(e: Entry) {
    await deleteFiles([e.path, e.thumbPath].filter(Boolean));
    await removeEntry(e.id);
    setConfirmId(null);
    if (playing?.id === e.id) setPlaying(null);
    void refresh();
  }

  return (
    <div className="lib-backdrop" onClick={onClose}>
      <div className="lib-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lib-head">
          <span>LOG LIBRARY · {entries.length}</span>
          <button className="lib-x" onClick={onClose}>
            ✕
          </button>
        </div>

        {entries.length === 0 ? (
          <div className="lib-empty">No recordings yet.</div>
        ) : (
          <div className="lib-grid">
            {entries.map((e) => (
              <div className="lib-card" key={e.id}>
                <div className="lib-thumb" onClick={() => setPlaying(e)}>
                  {e.thumbPath ? (
                    <img src={convertFileSrc(e.thumbPath)} alt="" />
                  ) : (
                    <div className="lib-thumb-ph">▶</div>
                  )}
                  <span className="lib-dur">{fmtDur(e.durationSec)}</span>
                </div>
                <div className="lib-name">
                  {e.name.toUpperCase()} #{e.logNo}
                </div>
                <div className="lib-sub">
                  {fmtDate(e.dateISO)} · {e.city} · {fmtSize(e.size)}
                </div>
                <div className="lib-actions">
                  <button onClick={() => setPlaying(e)}>PLAY</button>
                  <button onClick={() => void revealItemInDir(e.path)}>REVEAL</button>
                  {confirmId === e.id ? (
                    <button className="danger" onClick={() => void doDelete(e)}>
                      CONFIRM?
                    </button>
                  ) : (
                    <button className="danger" onClick={() => setConfirmId(e.id)}>
                      DELETE
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {playing && (
        <div className="lib-player" onClick={() => setPlaying(null)}>
          <video
            src={convertFileSrc(playing.path)}
            controls
            autoPlay
            onClick={(e) => e.stopPropagation()}
          />
          <button className="lib-x player-x" onClick={() => setPlaying(null)}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
