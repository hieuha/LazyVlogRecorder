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
  /** The first chunk-write failure (or queue overflow), else null. Read after
   *  stop() to warn that the saved take may be incomplete instead of reporting a
   *  clean success — the whole point of streaming-to-disk is durability. */
  getWriteError(): unknown | null;
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
  /** Max chunk writes allowed in flight before the sink is declared too slow.
   *  Past this the recorder stops queuing new chunks (bounding memory) and flags
   *  a write error instead of growing the queue without limit. Unset = no cap.
   *  Only the local-recording path sets this: for streaming, `onChunk` also feeds
   *  the RTMP write, so a cap keyed on the local-disk backlog must NOT drop chunks
   *  (it would kill the broadcast when only the disk is slow). */
  maxPendingChunks?: number;
  /** Fired once when the write queue overflows `maxPendingChunks`, so the
   *  controller can stop the take cleanly (the disk can't keep up). */
  onOverflow?: () => void;
  /** Encoder rate-control mode. Streaming sets "constant" so the hardware encoder
   *  holds `videoBitsPerSecond` instead of undershooting it on low-motion footage
   *  (the default VBR treats the rate as a ceiling → RTMP platforms see a bitrate
   *  far below the target). Local recording leaves it VBR for smaller files. */
  bitrateMode?: "constant" | "variable";
}

export function createRecorder({
  canvas,
  micStream,
  mimeType,
  onChunk,
  fps = 30,
  timesliceMs = 1000,
  videoBitsPerSecond,
  maxPendingChunks = Infinity,
  onOverflow,
  bitrateMode,
}: RecorderOptions): Recorder {
  // Fixed capture rate: the browser resamples our rAF-throttled draws to a
  // constant output cadence, which delivers smoother than capture-on-change
  // (that would carry the compositor's frame-timing jitter through to viewers).
  const videoStream = canvas.captureStream(fps);
  const tracks: MediaStreamTrack[] = [videoStream.getVideoTracks()[0]];
  const audioTrack = micStream?.getAudioTracks()[0];
  if (audioTrack) tracks.push(audioTrack);

  const combined = new MediaStream(tracks);
  // bitrateMode isn't in every lib.dom typings yet, so extend the options type.
  const recOpts: MediaRecorderOptions & { bitrateMode?: "constant" | "variable" } = { mimeType };
  if (videoBitsPerSecond) recOpts.videoBitsPerSecond = videoBitsPerSecond;
  if (bitrateMode) recOpts.bitrateMode = bitrateMode;
  const recorder = new MediaRecorder(combined, recOpts);
  // Chunks are processed strictly in order via a promise chain: chunk N+1 never
  // starts writing until chunk N finishes, so the temp file's byte order (and the
  // WebM stream) can't be corrupted by overlapping writes under load. `pending`
  // tracks the tail so stop() can flush the last write. A failed write no longer
  // breaks the chain for the rest, but the first failure is remembered (below) so
  // the save flow can warn instead of claiming a clean success.
  const pending = new Set<Promise<void>>();
  let tail: Promise<void> = Promise.resolve();
  // First write failure / overflow, surfaced via getWriteError(). Swallowing this
  // (the old `.catch(() => {})`) turned disk-full/permission errors into silent
  // data loss presented as a successful save.
  let writeError: unknown = null;
  let overflowed = false;
  recorder.ondataavailable = (e) => {
    if (e.data.size === 0 || overflowed) return; // once overflowed, drop the tail: we're stopping
    // Bounded buffer: if the sink can't keep up, stop queuing so memory can't
    // grow without limit. The controller (onOverflow) ends the take; whatever is
    // already written is salvaged, and getWriteError() explains the truncation.
    if (pending.size >= maxPendingChunks) {
      overflowed = true;
      if (writeError == null) {
        writeError = new Error(`recording sink too slow — >${maxPendingChunks} chunks queued`);
      }
      onOverflow?.();
      return;
    }
    const p = tail
      .then(() => onChunk(e.data))
      .catch((err) => {
        if (writeError == null) writeError = err; // remember the first failure
      });
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
    getWriteError: () => writeError,
  };
}
