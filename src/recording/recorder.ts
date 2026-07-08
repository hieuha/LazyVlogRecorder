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
  fps?: number;
}

export function createRecorder({
  canvas,
  micStream,
  mimeType,
  onChunk,
  fps = 30,
}: RecorderOptions): Recorder {
  const videoStream = canvas.captureStream(fps);
  const tracks: MediaStreamTrack[] = [videoStream.getVideoTracks()[0]];
  const audioTrack = micStream?.getAudioTracks()[0];
  if (audioTrack) tracks.push(audioTrack);

  const combined = new MediaStream(tracks);
  const recorder = new MediaRecorder(combined, { mimeType });
  const pending: Promise<void>[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) pending.push(onChunk(e.data));
  };

  return {
    mimeType,
    start() {
      recorder.start(1000); // emit a chunk every second
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
