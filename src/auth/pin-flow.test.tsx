import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("./auth-client", () => ({
  verifyPin: vi.fn(),
  savePin: vi.fn(async () => {}),
  changePin: vi.fn(async () => {}),
}));

import { changePin, savePin, verifyPin } from "./auth-client";
import { PinGate } from "./pin-gate";
import { ChangePinFlow } from "./change-pin-flow";

const mVerify = verifyPin as unknown as Mock;
const mSave = savePin as unknown as Mock;
const mChange = changePin as unknown as Mock;

const enter = (pin: string) => {
  for (const d of pin) fireEvent.click(screen.getByRole("button", { name: d }));
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("PinGate — enter mode", () => {
  it("unlocks when the PIN verifies", async () => {
    mVerify.mockResolvedValue(true);
    const onUnlocked = vi.fn();
    render(<PinGate mode="enter" onUnlocked={onUnlocked} />);
    enter("1234");
    await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
    expect(mVerify).toHaveBeenCalledWith("1234");
  });

  it("shows ACCESS DENIED and does not unlock on a wrong PIN", async () => {
    mVerify.mockResolvedValue(false);
    const onUnlocked = vi.fn();
    render(<PinGate mode="enter" onUnlocked={onUnlocked} />);
    enter("0000");
    await waitFor(() => expect(screen.getByText("ACCESS DENIED")).toBeInTheDocument());
    expect(onUnlocked).not.toHaveBeenCalled();
  });
});

describe("PinGate — set mode (onboarding)", () => {
  it("asks to confirm, then saves when both entries match", async () => {
    const onUnlocked = vi.fn();
    render(<PinGate mode="set" onUnlocked={onUnlocked} />);
    expect(screen.getByText("SET ACCESS PIN")).toBeInTheDocument();
    enter("1357");
    await waitFor(() => expect(screen.getByText("CONFIRM PIN")).toBeInTheDocument());
    expect(mSave).not.toHaveBeenCalled(); // not saved until confirmed
    enter("1357");
    await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
    expect(mSave).toHaveBeenCalledWith("1357");
  });

  it("rejects a mismatched confirmation and restarts", async () => {
    render(<PinGate mode="set" onUnlocked={vi.fn()} />);
    enter("1111");
    await waitFor(() => expect(screen.getByText("CONFIRM PIN")).toBeInTheDocument());
    enter("2222");
    await waitFor(() => expect(screen.getByText("PIN MISMATCH")).toBeInTheDocument());
    expect(screen.getByText("SET ACCESS PIN")).toBeInTheDocument();
    expect(mSave).not.toHaveBeenCalled();
  });
});

describe("ChangePinFlow", () => {
  it("walks current → new → confirm and calls changePin", async () => {
    mVerify.mockResolvedValue(true);
    const onDone = vi.fn();
    render(<ChangePinFlow onClose={vi.fn()} onDone={onDone} />);
    expect(screen.getByText("CURRENT PIN")).toBeInTheDocument();
    enter("1111");
    await waitFor(() => expect(screen.getByText("NEW PIN")).toBeInTheDocument());
    enter("2222");
    await waitFor(() => expect(screen.getByText("CONFIRM NEW PIN")).toBeInTheDocument());
    enter("2222");
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mChange).toHaveBeenCalledWith("1111", "2222");
  });

  it("shows WRONG PIN when the current PIN is incorrect", async () => {
    mVerify.mockResolvedValue(false);
    render(<ChangePinFlow onClose={vi.fn()} onDone={vi.fn()} />);
    enter("9999");
    await waitFor(() => expect(screen.getByText("WRONG PIN")).toBeInTheDocument());
    expect(mChange).not.toHaveBeenCalled();
  });

  it("closes via the ✕ button", () => {
    const onClose = vi.fn();
    render(<ChangePinFlow onClose={onClose} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    expect(onClose).toHaveBeenCalled();
  });
});
