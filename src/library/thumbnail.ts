// Library thumbnails, rendered in the webview (no ffmpeg). iOS can't spawn a
// subprocess, so instead of shelling out we seek a hidden <video> to ~1s, draw
// that frame onto a canvas, and hand the JPEG bytes to the backend to persist in
// the app cache. Same code path on macOS and iOS. Best-effort: any failure
// resolves to "" so a save is never blocked by a missing thumbnail.

import { convertFileSrc, invoke } from "@tauri-apps/api/core";

const THUMB_WIDTH = 480; // matches the previous ffmpeg scale=480:-1
const CAPTURE_TIMEOUT_MS = 5000; // never hang the save flow on a stuck decode

/** Render + persist a thumbnail for `videoPath`; returns the saved path or "". */
export async function generateThumbnail(videoPath: string, id: string): Promise<string> {
  const blob = await captureFrame(videoPath);
  if (!blob) return "";
  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
  try {
    return await invoke<string>("save_thumbnail", { id, bytes });
  } catch {
    return "";
  }
}

/** Grab a single JPEG frame (~1s in) from a local video via canvas. */
function captureFrame(videoPath: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    // The asset protocol is served same-origin, but request CORS anyway so the
    // canvas isn't tainted (a tainted canvas makes toBlob throw SecurityError).
    video.crossOrigin = "anonymous";

    let settled = false;
    const timer = window.setTimeout(() => finish(null), CAPTURE_TIMEOUT_MS);
    function finish(blob: Blob | null) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load(); // release the decoder
      resolve(blob);
    }

    function drawFrame() {
      try {
        const vw = video.videoWidth || THUMB_WIDTH;
        const vh = video.videoHeight || Math.round((THUMB_WIDTH * 9) / 16);
        const w = THUMB_WIDTH;
        const h = Math.max(1, Math.round((vh / vw) * w));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, w, h);
        canvas.toBlob((b) => finish(b), "image/jpeg", 0.7);
      } catch {
        finish(null);
      }
    }

    video.onerror = () => finish(null);
    video.onloadeddata = () => {
      // Seek ~1s in for a representative frame; near the start for short clips.
      const target = Number.isFinite(video.duration) && video.duration > 1.2 ? 1 : 0;
      if (target === 0) {
        drawFrame(); // already at/near the first frame
      } else {
        video.onseeked = drawFrame;
        video.currentTime = target;
      }
    };

    video.src = convertFileSrc(videoPath);
    video.load();
  });
}
