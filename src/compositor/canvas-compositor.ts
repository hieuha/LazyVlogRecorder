// Canvas compositor: draws the live webcam frame onto a single <canvas>,
// then lets registered layers (the HUD in Phase 2) draw on top of the same
// frame. Because everything lives on one canvas, `canvas.captureStream()`
// (Phase 4) records the webcam + HUD burned in together.

import { drawCrtOverlay } from "../hud/widgets/signal-noise";

export interface LayerContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Monotonic frame counter since start. */
  frame: number;
  /** High-resolution timestamp of this frame (ms). */
  now: number;
}

export type LayerDrawFn = (layer: LayerContext) => void;

export class CanvasCompositor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private video: HTMLVideoElement;
  private layers: LayerDrawFn[] = [];
  private rafId: number | null = null;
  private frame = 0;
  // While `now < transitionUntil` the frame is filled with TV static — used as a
  // "signal loss" transition when the camera is switched mid-recording.
  private transitionUntil = 0;
  private transitionMs = 700;
  private noiseTile: HTMLCanvasElement | null = null;
  private mirrored = false; // horizontal flip of the webcam (not the HUD)
  private crt = true; // CRT/analog grain overlay, applied over every layout

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.video = document.createElement("video");
    this.video.muted = true; // avoid mic feedback in preview
    this.video.playsInline = true;
  }

  /** Attach a media stream and begin the render loop. */
  async start(stream: MediaStream): Promise<void> {
    this.video.srcObject = stream;
    await this.video.play();
    this.resizeToDisplay();
    if (this.rafId === null) this.loop();
  }

  /** Stop the render loop (does not stop the media stream). */
  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.video.srcObject = null;
  }

  registerLayer(fn: LayerDrawFn): () => void {
    this.layers.push(fn);
    return () => {
      this.layers = this.layers.filter((l) => l !== fn);
    };
  }

  /** The canvas element, used by Phase 4 to build a capture stream. */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /** Show a static + collapse-to-center transition for `ms` (camera switch). */
  triggerSwitchTransition(ms = 700): void {
    this.transitionMs = ms;
    this.transitionUntil = performance.now() + ms;
  }

  /** Mirror the webcam horizontally (HUD stays unflipped). */
  setMirror(on: boolean): void {
    this.mirrored = on;
  }

  /** Toggle the CRT grain overlay (applies over every layout). */
  setCrt(on: boolean): void {
    this.crt = on;
  }

  // Size the canvas backing store to its on-screen size (× DPR) so the video
  // fills the window with no letterbox bars, and the HUD spans the full frame.
  private resizeToDisplay(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private loop = (): void => {
    this.rafId = requestAnimationFrame(this.loop);
    this.resizeToDisplay();

    const { width, height } = this.canvas;
    const now = performance.now();
    const videoReady = this.video.readyState >= 2 && this.video.videoWidth > 0;

    // Draw the webcam when it has data; otherwise keep the last frame so a
    // camera swap doesn't flash black underneath the static.
    const inTransition = now < this.transitionUntil;
    if (videoReady) this.drawVideoCover(width, height);
    if (inTransition) {
      this.drawStatic(width, height);
      const p = Math.min(1, Math.max(0, 1 - (this.transitionUntil - now) / this.transitionMs));
      this.drawCollapse(width, height, p);
    }

    const layerCtx: LayerContext = { ctx: this.ctx, width, height, frame: this.frame++, now };
    for (const layer of this.layers) layer(layerCtx);

    // CRT grain over everything — skipped during a transition (the static burst
    // already provides grain, and this avoids generating two noise tiles/frame).
    if (this.crt && !inTransition) drawCrtOverlay(this.ctx, width, height);
  };

  // Full-frame grayscale static with slight jitter (signal-loss transition).
  private drawStatic(w: number, h: number): void {
    const pattern = this.ctx.createPattern(this.staticTile(), "repeat");
    if (!pattern) return;
    this.ctx.save();
    this.ctx.globalAlpha = 0.92;
    this.ctx.fillStyle = pattern;
    this.ctx.translate((Math.random() * 2 - 1) * 5, (Math.random() * 2 - 1) * 5);
    this.ctx.fillRect(-8, -8, w + 16, h + 16);
    this.ctx.restore();
  }

  // CRT power-off style: the visible feed collapses into a shrinking circle at
  // center (p: 0 open → 0.5 pinched to a dot → 1 open) with a bright ring.
  private drawCollapse(w: number, h: number, p: number): void {
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(w, h) / 2;
    const r = maxR * Math.abs(Math.cos(p * Math.PI));
    const ctx = this.ctx;

    ctx.save();
    // Darken everything outside the shrinking circle.
    const mask = ctx.createRadialGradient(cx, cy, Math.max(0, r - 2), cx, cy, r + w * 0.4);
    mask.addColorStop(0, "rgba(0,0,0,0)");
    mask.addColorStop(0.03, "rgba(2,4,6,0.92)");
    mask.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, w, h);

    // Bright CRT ring at the collapsing edge.
    ctx.strokeStyle = "rgba(206,244,248,0.85)";
    ctx.lineWidth = Math.max(1, w * 0.003);
    ctx.shadowColor = "rgba(150,235,240,0.9)";
    ctx.shadowBlur = w * 0.012;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private staticTile(): HTMLCanvasElement {
    if (!this.noiseTile) {
      this.noiseTile = document.createElement("canvas");
      this.noiseTile.width = 128;
      this.noiseTile.height = 128;
    }
    // Regenerate the noise only every other frame to halve the per-frame cost;
    // still reads as animated grain.
    if (this.frame % 2 !== 0) return this.noiseTile;
    const t = this.noiseTile.getContext("2d");
    if (!t) return this.noiseTile;
    const img = t.createImageData(128, 128);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    t.putImageData(img, 0, 0);
    return this.noiseTile;
  }

  /** Draw the video scaled to cover the canvas (center-crop, no distortion). */
  private drawVideoCover(cw: number, ch: number): void {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh) return;
    const scale = Math.max(cw / vw, ch / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    if (this.mirrored) {
      this.ctx.save();
      this.ctx.translate(cw, 0);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(this.video, dx, dy, dw, dh);
      this.ctx.restore();
    } else {
      this.ctx.drawImage(this.video, dx, dy, dw, dh);
    }
  }
}
