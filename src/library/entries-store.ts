// Persistent index of recorded entries (Tauri Store). Source of truth for the
// library; delete removes the file + thumbnail + this record together.

import { LazyStore } from "@tauri-apps/plugin-store";

export interface Entry {
  id: string;
  name: string;
  logNo: number;
  dateISO: string;
  city: string;
  durationSec: number;
  path: string;
  size: number;
  thumbPath: string;
}

const store = new LazyStore("entries.json");

async function readAll(): Promise<Entry[]> {
  try {
    return (await store.get<Entry[]>("list")) ?? [];
  } catch {
    return [];
  }
}

async function writeAll(list: Entry[]): Promise<void> {
  await store.set("list", list);
  await store.save();
}

/** Newest first. */
export async function listEntries(): Promise<Entry[]> {
  const list = await readAll();
  return [...list].sort((a, b) => b.dateISO.localeCompare(a.dateISO));
}

export async function addEntry(entry: Entry): Promise<void> {
  await writeAll([...(await readAll()), entry]);
}

export async function updateEntry(id: string, patch: Partial<Entry>): Promise<void> {
  await writeAll((await readAll()).map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

export async function removeEntry(id: string): Promise<void> {
  await writeAll((await readAll()).filter((e) => e.id !== id));
}
