// Change-PIN overlay: current PIN → new PIN → confirm, via the shared HUD keypad.

import { useState } from "react";
import { changePin, verifyPin } from "./auth-client";
import { PinPad } from "./pin-pad";

const LEN = 4;
type Step = "current" | "new" | "confirm";

export function ChangePinFlow({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<Step>("current");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
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
      if (step === "current") {
        if (await verifyPin(value)) {
          setCurrentPin(value);
          setPin("");
          setError("");
          setStep("new");
        } else fail("WRONG PIN");
      } else if (step === "new") {
        setNewPin(value);
        setPin("");
        setError("");
        setStep("confirm");
      } else if (value === newPin) {
        await changePin(currentPin, value);
        onDone();
      } else {
        setNewPin("");
        setPin("");
        setStep("new");
        fail("PIN MISMATCH");
      }
    } catch (e) {
      fail(String(e));
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
    step === "current" ? "CURRENT PIN" : step === "new" ? "NEW PIN" : "CONFIRM NEW PIN";

  return (
    <PinPad
      title={title}
      len={LEN}
      pin={pin}
      error={error}
      shake={shake}
      onDigit={digit}
      onDelete={() => setPin((p) => p.slice(0, -1))}
      onClose={onClose}
    />
  );
}
