// Launch gate. mode="set" runs first-launch onboarding (enter + confirm);
// mode="enter" unlocks the app. 4-digit PIN via the shared HUD keypad.

import { useState } from "react";
import { savePin, verifyPin } from "./auth-client";
import { PinPad } from "./pin-pad";

const LEN = 4;

export function PinGate({ mode, onUnlocked }: { mode: "set" | "enter"; onUnlocked: () => void }) {
  const [phase, setPhase] = useState<"first" | "confirm">("first");
  const [firstPin, setFirstPin] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  function fail(msg: string) {
    setError(msg);
    setPin("");
    setShake(true);
    setTimeout(() => setShake(false), 420);
  }

  async function submit(value: string) {
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "enter") {
        if (await verifyPin(value)) onUnlocked();
        else fail("ACCESS DENIED");
      } else if (phase === "first") {
        setFirstPin(value);
        setPin("");
        setPhase("confirm");
        setError("");
      } else if (value === firstPin) {
        await savePin(value);
        onUnlocked();
      } else {
        setPhase("first");
        setFirstPin("");
        fail("PIN MISMATCH");
      }
    } finally {
      setBusy(false);
    }
  }

  function digit(d: string) {
    if (pin.length >= LEN || busy) return;
    const next = pin + d;
    setPin(next);
    setError("");
    if (next.length === LEN) setTimeout(() => void submit(next), 130);
  }

  const title =
    mode === "enter" ? "ENTER PIN" : phase === "first" ? "SET ACCESS PIN" : "CONFIRM PIN";

  return (
    <PinPad
      title={title}
      len={LEN}
      pin={pin}
      error={error}
      shake={shake}
      onDigit={digit}
      onDelete={() => setPin((p) => p.slice(0, -1))}
    />
  );
}
