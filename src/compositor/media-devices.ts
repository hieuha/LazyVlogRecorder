// Camera + microphone access and enumeration.
// Phase 1: request permission, list devices (camera + mic), open a stream
// with optional device selection. Device IDs are consumed by settings (Phase 6).

export interface MediaDeviceLists {
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
}

export interface OpenStreamOptions {
  cameraDeviceId?: string;
  micDeviceId?: string;
  audio: boolean;
  /** Requested capture size; browser picks nearest supported. */
  width?: number;
  height?: number;
}

export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

/**
 * Trigger the OS/browser permission prompt once. Device labels stay empty
 * until this resolves, so callers should run it before {@link enumerateDevices}.
 */
export async function requestPermission(audio: boolean): Promise<void> {
  let stream: MediaStream | undefined;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio });
  } catch (err) {
    throw toPermissionError(err);
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
  }
}

/** List available cameras and microphones. Labels require prior permission. */
export async function enumerateDevices(): Promise<MediaDeviceLists> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: all.filter((d) => d.kind === "videoinput"),
    mics: all.filter((d) => d.kind === "audioinput"),
  };
}

/** Open a live webcam (+mic) stream, honoring optional device selection. */
export async function openStream(opts: OpenStreamOptions): Promise<MediaStream> {
  const video: MediaTrackConstraints = {
    width: opts.width ? { ideal: opts.width } : undefined,
    height: opts.height ? { ideal: opts.height } : undefined,
    deviceId: opts.cameraDeviceId ? { exact: opts.cameraDeviceId } : undefined,
  };
  const audio: boolean | MediaTrackConstraints = opts.audio
    ? { deviceId: opts.micDeviceId ? { exact: opts.micDeviceId } : undefined }
    : false;

  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio });
  } catch (err) {
    throw toPermissionError(err);
  }
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

function toPermissionError(err: unknown): Error {
  const e = err as DOMException | undefined;
  if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
    return new PermissionDeniedError(
      "Camera/microphone permission denied. Grant access in system settings and reload.",
    );
  }
  if (e && e.name === "NotFoundError") {
    return new PermissionDeniedError("No camera or microphone found on this device.");
  }
  return err instanceof Error ? err : new Error(String(err));
}
