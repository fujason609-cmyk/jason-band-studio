import { useState, type CSSProperties, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/common/IconButton";
import { useT } from "@/i18n/useT";
import { INLAY_FRETS, MAX_FRET, clampFretStart, fretPitch } from "@/lib/fretboard";
import { pitchName } from "@/lib/keyboardMap";

interface Props {
  /** open-string pitches, lowest string first */
  tuning: readonly number[];
  /** how many frets fit on screen, counting the open string */
  visible: number;
  active: ReadonlySet<number>;
  press: (source: string, pitch: number) => void;
  release: (source: string) => void;
  /** mirror the neck for a left-handed player: nut on the right, frets rising leftwards */
  leftHanded?: boolean;
}

/**
 * Guitar / bass neck, drawn like a tab: highest string on top. Tap a fret to play
 * it, or slide along a string. On small screens only a window of frets shows,
 * and the arrows move it up and down the neck. Left-handed, everything is mirrored,
 * so the arrows still point the way the frets go.
 */
export function Fretboard({ tuning, visible, active, press, release, leftHanded = false }: Props) {
  const t = useT();
  const [start, setStart] = useState(0);
  const first = clampFretStart(start, visible);
  const frets = Array.from({ length: Math.min(visible, MAX_FRET + 1) }, (_, i) => first + i);
  const strings = tuning.map((_, i) => i).reverse();
  const windowed = visible < MAX_FRET + 1;
  const step = Math.max(1, visible - 2);
  const TowardNut = leftHanded ? ChevronRight : ChevronLeft;
  const UpTheNeck = leftHanded ? ChevronLeft : ChevronRight;

  const handlers = (pitch: number) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      press(`ptr:${e.pointerId}`, pitch);
    },
    onPointerUp: (e: PointerEvent) => release(`ptr:${e.pointerId}`),
    onPointerLeave: (e: PointerEvent) => release(`ptr:${e.pointerId}`),
    onPointerCancel: (e: PointerEvent) => release(`ptr:${e.pointerId}`),
    onPointerEnter: (e: PointerEvent) => {
      if (e.buttons === 1) press(`ptr:${e.pointerId}`, pitch);
    },
    onClick: (e: React.MouseEvent) => {
      if (e.detail === 0) {
        press("click", pitch);
        setTimeout(() => release("click"), 300);
      }
    },
  });

  return (
    <div className="fretboard-wrap">
      {windowed && (
        <div className={`fret-nav ${leftHanded ? "fret-nav--left" : ""}`}>
          <IconButton label={t.lowerFrets} variant="quiet" onClick={() => setStart(clampFretStart(first - step, visible))} disabled={first === 0}>
            <TowardNut size={18} />
          </IconButton>
          <span className="fret-nav__range">{t.fretRange(first, frets[frets.length - 1]!)}</span>
          <IconButton
            label={t.higherFrets}
            variant="quiet"
            onClick={() => setStart(clampFretStart(first + step, visible))}
            disabled={frets[frets.length - 1] === MAX_FRET}
          >
            <UpTheNeck size={18} />
          </IconButton>
        </div>
      )}
      <div
        className={`fretboard ${leftHanded ? "fretboard--left" : ""}`}
        style={{ "--frets": frets.length, "--strings": tuning.length } as CSSProperties}
      >
        {strings.map((s) => (
          <div key={s} className="fretboard__string" style={{ "--gauge": 1 + (tuning.length - 1 - s) * 0.45 } as CSSProperties}>
            <span className="fretboard__tuning" aria-hidden="true">
              {pitchName(tuning[s]!).replace(/-?\d+$/, "")}
            </span>
            {frets.map((fret) => {
              const pitch = fretPitch(tuning, s, fret);
              const on = active.has(pitch);
              return (
                <button
                  key={fret}
                  type="button"
                  className={`fret ${fret === 0 ? "fret--open" : ""} ${on ? "is-down" : ""}`}
                  aria-label={t.fretNote(pitchName(pitch), tuning.length - s, fret)}
                  aria-pressed={on}
                  {...handlers(pitch)}
                >
                  {on && <span className="fret__dot">{pitchName(pitch).replace(/-?\d+$/, "")}</span>}
                </button>
              );
            })}
          </div>
        ))}
        <div className="fretboard__inlays" aria-hidden="true">
          <span />
          {frets.map((fret) => (
            <span key={fret} className={INLAY_FRETS.includes(fret) ? "is-inlay" : ""}>
              {fret}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
