// Share a saved recording via the native share sheet (Web Share API). On iOS
// this opens the system sheet — Save Video (→ Photos), Save to Files, AirDrop,
// Messages, and any other app — so it covers export + share in one action, with
// no native plugin. Returns false when unsupported (or the user cancels) so the
// caller can keep a desktop fallback like reveal-in-folder.

import { convertFileSrc } from "@tauri-apps/api/core";

export async function shareVideo(path: string, title: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") {
      return false;
    }
    // Pull the file into the webview as a File so the share sheet gets the video
    // itself (not just a link). convertFileSrc serves it via the asset protocol.
    const resp = await fetch(convertFileSrc(path));
    const blob = await resp.blob();
    const name = path.split("/").pop() || "video.mp4";
    const file = new File([blob], name, { type: blob.type || "video/mp4" });
    if (!navigator.canShare({ files: [file] })) return false;
    await navigator.share({ files: [file], title });
    return true;
  } catch {
    // Unsupported, denied, or user-cancelled — treat as a no-op.
    return false;
  }
}
