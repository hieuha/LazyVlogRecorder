// MediaRecorder wrapper: combines the compositor canvas (webcam + HUD burned in)
// with the mic audio track into one stream. Chunks are streamed out via onChunk
// as they arrive (written straight to a temp file) so memory stays flat for long
// clips. stop() resolves once the final chunk has been flushed.

export interface Recorder {
  start(): void;
  stop(): Promise<void>;
  pause(): void;
  resume(): void;
  readonly mimeType: string;
}

export interface RecorderOptions {
  canvas: HTMLCanvasElement;
  micStream: MediaStream | null;
  mimeType: string;
  onChunk: (chunk: Blob) => Promise<void>;
  /** Capture rate for captureStream. A fixed rate lets the browser resample our
   *  (rAF-jittered) draws to a constant output cadence — smoother for streaming
   *  than capture-on-change, which propagates the draw jitter to viewers. */
  fps?: number;
  /** Chunk cadence in ms. Local recording uses 1000; live streaming uses a
   *  shorter slice (~500) to trade a little overhead for lower latency and
   *  finer backpressure granularity. */
  timesliceMs?: number;
  /** Cap the intermediate encoder bitrate (bits/s). Live streaming sets this so
   *  the throwaway VP8 isn't encoded far above the target, reducing CPU (and thus
   *  capture stutter). Local recording leaves it unset for full quality. */
  videoBitsPerSecond?: number;
}

export function createRecorder({
  canvas,
  micStream,
  mimeType,
  onChunk,
  fps = 30,
  timesliceMs = 1000,
  videoBitsPerSecond,
}: RecorderOptions): Recorder {
  // Fixed capture rate: the browser resamples our rAF-throttled draws to a
  // constant output cadence, which delivers smoother than capture-on-change
  // (that would carry the compositor's frame-timing jitter through to viewers).
  const videoStream = canvas.captureStream(fps);
  const tracks: MediaStreamTrack[] = [videoStream.getVideoTracks()[0]];
  const audioTrack = micStream?.getAudioTracks()[0];
  if (audioTrack) tracks.push(audioTrack);

  const combined = new MediaStream(tracks);
  const recorder = new MediaRecorder(
    combined,
    videoBitsPerSecond ? { mimeType, videoBitsPerSecond } : { mimeType },
  );
  // Chunks are processed strictly in order via a promise chain: chunk N+1 never
  // starts writing until chunk N finishes, so the temp file's byte order (and the
  // WebM stream) can't be corrupted by overlapping writes under load. `pending`
  // tracks the tail so stop() can flush the last write. Each link catches its own
  // error so one failed write doesn't break the chain for the rest.
  const pending = new Set<Promise<void>>();
  let tail: Promise<void> = Promise.resolve();
  recorder.ondataavailable = (e) => {
    if (e.data.size === 0) return;
    const p = tail.then(() => onChunk(e.data)).catch(() => {});
    tail = p;
    pending.add(p);
    void p.finally(() => pending.delete(p));
  };

  return {
    mimeType,
    start() {
      recorder.start(timesliceMs); // emit a chunk every timesliceMs
    },
    pause() {
      if (recorder.state === "recording") recorder.pause();
    },
    resume() {
      if (recorder.state === "paused") recorder.resume();
    },
    stop() {
      return new Promise<void>((resolve) => {
        recorder.onstop = () => {
          // Ensure every appended chunk has been written before resolving.
          void Promise.allSettled(pending).then(() => resolve());
        };
        recorder.stop();
      });
    },
  };
}
