import type { CSSProperties } from "react";

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

export function Fader({ label, value, onChange, min = 0, max = 1, step = 0.01, valueText, className = "", color }: FaderProps) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className={`fader ${className}`}
      aria-label={label}
      aria-valuetext={valueText}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.currentTarget.value))}
      style={{ "--fill": `${fill}%`, ...(color ? { "--fader-color": color } : {}) } as CSSProperties}
    />
  );
}
