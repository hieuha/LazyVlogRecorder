// CRT / analog signal overlay: animated film grain + a slow rolling refresh
// band. Drawn on top of the whole frame (including HUD) so the recording gets
// the "dashcam signal" look. Kept cheap: a small noise tile refreshed per frame
// and tiled via a pattern, plus one gradient band.

import type { WidgetRenderContext } from "../types";

const TILE = 128;
let tileCanvas: HTMLCanvasElement | null = null;

function refreshNoiseTile(): HTMLCanvasElement {
  if (!tileCanvas) {
    tileCanvas = document.createElement("canvas");
    tileCanvas.width = TILE;
    tileCanvas.height = TILE;
  }
  const tctx = tileCanvas.getContext("2d");
  if (!tctx) return tileCanvas;
  const img = tctx.createImageData(TILE, TILE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);
  return tileCanvas;
}

export function drawSignalNoise(c: WidgetRenderContext): void {
  const { ctx, width, height } = c;

  // Animated grain via overlay blend (subtle so HUD stays legible).
  const pattern = ctx.createPattern(refreshNoiseTile(), "repeat");
  if (pattern) {
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // Rolling CRT refresh band: a soft bright bar drifting downward.
  const bandH = height * 0.16;
  const y = (performance.now() / 22) % (height + bandH) - bandH;
  const band = ctx.createLinearGradient(0, y, 0, y + bandH);
  band.addColorStop(0, "rgba(255,255,255,0)");
  band.addColorStop(0.5, "rgba(220,240,245,0.05)");
  band.addColorStop(1, "rgba(255,255,255,0)");
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = band;
  ctx.fillRect(0, y, width, bandH);
  ctx.restore();
}
