// Custom HUD-styled dropdown (replaces native <select> so the open menu matches
// the app theme — the native option popup can't be CSS-styled). Opens upward
// since the controls sit at the bottom of the screen.

import { useEffect, useRef, useState } from "react";
import "./hud-select.css";

export interface HudOption {
  id: string;
  label: string;
}

interface Props {
  value: string;
  options: HudOption[];
  onChange: (id: string) => void;
  disabled?: boolean;
  title?: string;
}

export function HudSelect({ value, options, onChange, disabled, title }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className={`hud-select ${disabled ? "disabled" : ""}`} ref={ref} title={title}>
      <button
        type="button"
        className="hud-select-btn"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="hud-select-label">{current?.label ?? "—"}</span>
        <span className={`hud-select-caret ${open ? "up" : ""}`}>▾</span>
      </button>

      {open && !disabled && (
        <div className="hud-select-menu">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`hud-select-item ${o.id === value ? "active" : ""}`}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              <span className="hud-select-check">{o.id === value ? "✓" : ""}</span>
              <span className="hud-select-item-label">{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
