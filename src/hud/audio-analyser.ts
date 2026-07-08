// Real-time mic amplitude analyser feeding the soundwave widget. Keeps a rolling
// history of per-frame peak levels so the waveform scrolls like the reference.
// Analysis only — the graph is never connected to the audio destination, so it
// causes no feedback.

export interface AudioAnalyser {
  /** Sample `count` normalized 0..1 bar heights (advances the rolling history). */
  sampleBars(count: number): number[];
  dispose(): void;
}

const HISTORY = 72;

export function createAudioAnalyser(stream: MediaStream): AudioAnalyser | null {
  const track = stream.getAudioTracks()[0];
  if (!track) return null;

  const Ctor: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  const audioCtx = new Ctor();
  void audioCtx.resume(); // may start suspended on WKWebView
  const source = audioCtx.createMediaStreamSource(new MediaStream([track]));
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.55;
  source.connect(analyser);

  const timeData = new Uint8Array(analyser.fftSize);
  const history = new Array<number>(HISTORY).fill(0);

  return {
    sampleBars(count: number): number[] {
      analyser.getByteTimeDomainData(timeData);
      let peak = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = Math.abs(timeData[i] - 128);
        if (v > peak) peak = v;
      }
      const level = Math.min(1, (peak / 128) * 1.6);
      history.push(level);
      history.shift();

      if (count === HISTORY) return history.slice();
      const out = new Array<number>(count);
      for (let i = 0; i < count; i++) {
        out[i] = history[Math.floor((i / count) * HISTORY)];
      }
      return out;
    },
    dispose(): void {
      try {
        source.disconnect();
        analyser.disconnect();
        void audioCtx.close();
      } catch {
        /* already closed */
      }
    },
  };
}
