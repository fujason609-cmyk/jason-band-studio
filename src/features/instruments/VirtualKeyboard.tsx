import { isBlackKey, pitchName, pitchToKeyLabel } from "@/lib/keyboardMap";

interface Props {
  octave: number;
  active: ReadonlySet<number>;
  press: (source: string, pitch: number) => void;
  release: (source: string) => void;
  octaves?: number;
}

/** Two-octave on-screen keyboard. Pointer and computer keys share the same notes. */
export function VirtualKeyboard({ octave, active, press, release, octaves = 2 }: Props) {
  const start = 12 * (octave + 1);
  const pitches = Array.from({ length: octaves * 12 + 1 }, (_, i) => start + i).filter((p) => p <= 127);
  const whites = pitches.filter((p) => !isBlackKey(p));

  const handlers = (pitch: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      press(`ptr:${e.pointerId}`, pitch);
    },
    onPointerUp: (e: React.PointerEvent) => release(`ptr:${e.pointerId}`),
    onPointerLeave: (e: React.PointerEvent) => release(`ptr:${e.pointerId}`),
    onPointerCancel: (e: React.PointerEvent) => release(`ptr:${e.pointerId}`),
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.buttons === 1) press(`ptr:${e.pointerId}`, pitch);
    },
    onClick: (e: React.MouseEvent) => {
      // keyboard activation (Enter / Space on a focused key) has no pointer
      if (e.detail === 0) {
        press("click", pitch);
        setTimeout(() => release("click"), 300);
      }
    },
  });

  return (
    <div className="keys" style={{ "--white-count": whites.length } as React.CSSProperties}>
      {pitches.map((pitch) => {
        const black = isBlackKey(pitch);
        const whiteIndex = whites.filter((w) => w < pitch).length;
        const hint = pitchToKeyLabel(pitch, octave);
        return (
          <button
            key={pitch}
            type="button"
            className={`key ${black ? "key--black" : "key--white"} ${active.has(pitch) ? "is-down" : ""}`}
            style={{ "--i": whiteIndex } as React.CSSProperties}
            aria-label={pitchName(pitch)}
            aria-pressed={active.has(pitch)}
            {...handlers(pitch)}
          >
            {hint && <span className="key__hint">{hint}</span>}
            {!black && pitch % 12 === 0 && <span className="key__name">{pitchName(pitch)}</span>}
          </button>
        );
      })}
    </div>
  );
}
