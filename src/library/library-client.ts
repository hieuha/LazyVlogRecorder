// Frontend wrappers for library backend commands (thumbnail + delete).

import { invoke } from "@tauri-apps/api/core";

export function generateThumbnail(videoPath: string, id: string): Promise<string> {
  return invoke<string>("generate_thumbnail", { videoPath, id });
}

export function deleteFiles(paths: string[]): Promise<void> {
  return invoke("delete_files", { paths });
}
