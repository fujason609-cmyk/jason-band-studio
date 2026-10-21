import { useEffect, useRef, useState, type CSSProperties } from "react";

interface FaderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** text announced by screen readers, e.g. "80%" */
  valueText?: string;
  className?: string;
  color?: string;
}

/** How long the percentage stays up after the last change once the fader is let go. */
const BUBBLE_HOLD_MS = 800;

/**
 * A volume slider. While it is dragged (or moved with the keys) a bubble above the
 * handle shows the level in percent.
 */
export function Fader({ label, value, onChange, min = 0, max = 1, step = 0.01, valueText, className = "", color }: FaderProps) {
  const fill = ((value - min) / (max - min)) * 100;
  const [showing, setShowing] = useState(false);
  const dragging = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hideSoon = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!dragging.current) setShowing(false);
    }, BUBBLE_HOLD_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <span
      className={`fader-wrap ${className}`}
      style={{ "--fill": `${fill}%`, "--ratio": fill / 100, ...(color ? { "--fader-color": color } : {}) } as CSSProperties}
    >
      <input
        type="range"
        className="fader"
        aria-label={label}
        aria-valuetext={valueText}
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={() => {
          dragging.current = true;
          setShowing(true);
        }}
        onPointerUp={() => {
          dragging.current = false;
          hideSoon();
        }}
        onPointerCancel={() => {
          dragging.current = false;
          hideSoon();
        }}
        onBlur={() => {
          dragging.current = false;
          setShowing(false);
        }}
        onChange={(e) => {
          onChange(Number(e.currentTarget.value));
          setShowing(true);
          if (!dragging.current) hideSoon(); // keys, or a click that didn't drag
        }}
      />
      <span className={`fader__bubble ${showing ? "is-shown" : ""}`} aria-hidden="true">
        {Math.round(fill)}%
      </span>
    </span>
  );
}
