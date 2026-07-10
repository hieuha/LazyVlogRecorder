// UX gate lock for the Go-Live controls: destination toggle, the LIVE button's
// configured/not-configured behavior, and the save-local checkbox. The button is
// always clickable — unconfigured, it routes to Settings instead of broadcasting.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RecordingControls } from "./recording-controls";

afterEach(cleanup);

function props(overrides: Record<string, unknown> = {}) {
  return {
    mode: "free" as const,
    setMode: vi.fn(),
    durationSec: 1800,
    setDurationSec: vi.fn(),
    recording: false,
    live: false,
    paused: false,
    savedFile: null,
    saving: false,
    transcodeProgress: 0,
    error: null,
    disabled: false,
    destination: "local" as const,
    setDestination: vi.fn(),
    streamConfigured: false,
    saveLocalWhileLive: true,
    setSaveLocalWhileLive: vi.fn(),
    onStart: vi.fn(),
    onStop: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onGoLive: vi.fn(),
    onStopLive: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  };
}

describe("RecordingControls — Go Live", () => {
  it("switches destination LOCAL ↔ LIVE", () => {
    const p = props();
    render(<RecordingControls {...p} />);
    fireEvent.click(screen.getByText("LIVE"));
    expect(p.setDestination).toHaveBeenCalledWith("live");
  });

  it("shows REC on the LOCAL destination, not GO LIVE", () => {
    render(<RecordingControls {...props({ destination: "local" })} />);
    expect(screen.getByText("● REC")).toBeInTheDocument();
    expect(screen.queryByText(/GO LIVE/)).not.toBeInTheDocument();
  });

  it("routes an unconfigured GO LIVE to Settings, not to broadcast", () => {
    const p = props({ destination: "live", streamConfigured: false });
    render(<RecordingControls {...p} />);
    const btn = screen.getByText(/SET UP/); // gated button reads "◉ SET UP"
    fireEvent.click(btn);
    expect(p.onOpenSettings).toHaveBeenCalledOnce();
    expect(p.onGoLive).not.toHaveBeenCalled();
  });

  it("broadcasts when configured", () => {
    const p = props({ destination: "live", streamConfigured: true });
    render(<RecordingControls {...p} />);
    fireEvent.click(screen.getByText("◉ GO LIVE"));
    expect(p.onGoLive).toHaveBeenCalledOnce();
    expect(p.onOpenSettings).not.toHaveBeenCalled();
  });

  it("toggles save-local on the LIVE destination", () => {
    const p = props({ destination: "live", streamConfigured: true });
    render(<RecordingControls {...p} />);
    fireEvent.click(screen.getByLabelText(/SAVE LOCAL/));
    expect(p.setSaveLocalWhileLive).toHaveBeenCalledWith(false);
  });

  it("shows END LIVE and no pause while broadcasting", () => {
    const p = props({ live: true, destination: "live" });
    render(<RecordingControls {...p} />);
    expect(screen.getByText("■ END LIVE")).toBeInTheDocument();
    expect(screen.queryByText(/PAUSE/)).not.toBeInTheDocument();
  });
});
