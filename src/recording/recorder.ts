// MediaRecorder wrapper: combines the compositor canvas (webcam + HUD burned in)
// with the mic audio track into one stream and records it. Phase 5 transcodes
// the resulting WebM to MP4.

export interface Recorder {
  start(): void;
  /** Stop and resolve with the recorded blob (after the final chunk flushes). */
  stop(): Promise<Blob>;
  readonly mimeType: string;
}

export interface RecorderOptions {
  canvas: HTMLCanvasElement;
  micStream: MediaStream | null;
  mimeType: string;
  fps?: number;
}

export function createRecorder({ canvas, micStream, mimeType, fps = 30 }: RecorderOptions): Recorder {
  const videoStream = canvas.captureStream(fps);
  const tracks: MediaStreamTrack[] = [videoStream.getVideoTracks()[0]];
  const audioTrack = micStream?.getAudioTracks()[0];
  if (audioTrack) tracks.push(audioTrack);

  const combined = new MediaStream(tracks);
  const recorder = new MediaRecorder(combined, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return {
    mimeType,
    start() {
      chunks.length = 0;
      recorder.start(1000); // 1s timeslice → periodic chunks
    },
    stop() {
      return new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
        recorder.stop();
      });
    },
  };
}
