import { useT } from "@/i18n/useT";
import { CHORDS, type Chord } from "@/lib/fretboard";

interface Props {
  activeChords: ReadonlySet<string>;
  strum: (source: string, chord: Chord) => void;
  release: (source: string) => void;
}

/** Rhythm guitar: one pad per open chord. Press to strum, let go to mute. */
export function ChordPads({ activeChords, strum, release }: Props) {
  const t = useT();
  return (
    <div className="chords">
      {CHORDS.map((chord) => {
        const minor = chord.name.endsWith("m");
        return (
          <button
            key={chord.key}
            type="button"
            className={`chord ${minor ? "chord--minor" : ""} ${activeChords.has(chord.name) ? "is-down" : ""}`}
            aria-label={t.strumChord(chord.name)}
            onPointerDown={(e) => {
              e.preventDefault();
              strum(`ptr:${e.pointerId}:${chord.key}`, chord);
            }}
            onPointerUp={(e) => release(`ptr:${e.pointerId}:${chord.key}`)}
            onPointerLeave={(e) => release(`ptr:${e.pointerId}:${chord.key}`)}
            onPointerCancel={(e) => release(`ptr:${e.pointerId}:${chord.key}`)}
            onClick={(e) => {
              if (e.detail === 0) {
                strum(`click:${chord.key}`, chord);
                setTimeout(() => release(`click:${chord.key}`), 600);
              }
            }}
          >
            <span className="chord__name">{chord.name}</span>
            <span className="chord__strings" aria-hidden="true">
              {chord.pitches.map((p) => (
                <i key={p} />
              ))}
            </span>
            <span className="chord__hint">{chord.key.toUpperCase()}</span>
          </button>
        );
      })}
    </div>
  );
}
