import { DRUM_PADS } from "@/lib/drums";

interface Props {
  active: ReadonlySet<number>;
  press: (source: string, pitch: number) => void;
  release: (source: string) => void;
}

export function DrumPads({ active, press, release }: Props) {
  return (
    <div className="pads">
      {DRUM_PADS.map((pad) => (
        <button
          key={pad.key}
          type="button"
          className={`pad ${active.has(pad.pitch) ? "is-down" : ""}`}
          onPointerDown={(e) => {
            e.preventDefault();
            press(`ptr:${e.pointerId}:${pad.key}`, pad.pitch);
          }}
          onPointerUp={(e) => release(`ptr:${e.pointerId}:${pad.key}`)}
          onPointerLeave={(e) => release(`ptr:${e.pointerId}:${pad.key}`)}
          onClick={(e) => {
            if (e.detail === 0) {
              press(`click:${pad.key}`, pad.pitch);
              setTimeout(() => release(`click:${pad.key}`), 100);
            }
          }}
        >
          <span className="pad__label">{pad.label}</span>
          <span className="pad__hint">{pad.key.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}
