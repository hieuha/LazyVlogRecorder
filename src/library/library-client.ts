// Frontend wrappers for library backend commands. Thumbnails are rendered in the
// webview (see ./thumbnail.ts) — no ffmpeg — so only file deletion lives here.

import { invoke } from "@tauri-apps/api/core";

export function deleteFiles(paths: string[]): Promise<void> {
  return invoke("delete_files", { paths });
}
