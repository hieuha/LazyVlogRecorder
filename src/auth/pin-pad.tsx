// Presentational sci-fi PIN pad: title, dots, error, numeric keypad. Shared by
// the launch gate (PinGate) and the change-PIN flow.

import "./pin-gate.css";

interface Props {
  title: string;
  len: number;
  pin: string;
  error: string;
  shake: boolean;
  onDigit: (d: string) => void;
  onDelete: () => void;
  onClose?: () => void;
}

export function PinPad({ title, len, pin, error, shake, onDigit, onDelete, onClose }: Props) {
  return (
    <div className="pin-stage">
      <div className="pin-corner tl" />
      <div className="pin-corner tr" />
      <div className="pin-corner bl" />
      <div className="pin-corner br" />
      {onClose && (
        <button className="pin-close" onClick={onClose}>
          ✕
        </button>
      )}

      <div className="pin-brand">LAZY VLOG RECORDER</div>
      <div className="pin-title">{title}</div>

      <div className={`pin-dots ${shake ? "shake" : ""}`}>
        {Array.from({ length: len }).map((_, i) => (
          <span key={i} className={`pin-dot ${i < pin.length ? "on" : ""}`} />
        ))}
      </div>

      <div className={`pin-error ${error ? "show" : ""}`}>{error || " "}</div>

      <div className="pin-pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} className="pin-key" onClick={() => onDigit(d)}>
            {d}
          </button>
        ))}
        <span />
        <button className="pin-key" onClick={() => onDigit("0")}>
          0
        </button>
        <button className="pin-key del" onClick={onDelete}>
          ⌫
        </button>
      </div>
    </div>
  );
}
