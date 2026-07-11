// Log Library: grid of recorded entries with thumbnails, in-app playback,
// reveal-in-folder, and delete (file + thumbnail + index record).

import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { listEntries, removeEntry, type Entry } from "./entries-store";
import { deleteFiles } from "./library-client";
import "./library-view.css";

const PAGE_SIZE = 6; // entries per page (3×2 grid)

export function LibraryView({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [playing, setPlaying] = useState<Entry | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  async function refresh() {
    setEntries(await listEntries());
  }
  useEffect(() => {
    void refresh();
  }, []);

  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  // Clamp when the count shrinks (e.g. deleting the last item on the last page).
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);
  const safePage = Math.min(page, pageCount - 1);
  const visible = entries.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

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
            {visible.map((e) => (
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

        {pageCount > 1 && (
          <div className="lib-pager">
            <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              ‹ PREV
            </button>
            <span className="lib-pager-info">
              PAGE {safePage + 1} / {pageCount}
            </span>
            <button disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
              NEXT ›
            </button>
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
