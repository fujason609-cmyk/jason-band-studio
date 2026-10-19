import { MEMBERS } from "@/features/band/members";
import { TrackControls } from "./TrackControls";
import { useAnySolo, useMixerActions } from "./mixerStore";

export function TrackMixer() {
  const anySolo = useAnySolo();
  const { clearSolo } = useMixerActions();
  return (
    <section className="mixer" aria-label="Band mixer">
      <div className="mixer__head">
        <h2>The band</h2>
        {anySolo && (
          <button type="button" className="link-btn" onClick={clearSolo}>
            Clear solo
          </button>
        )}
      </div>
      {MEMBERS.map((m) => (
        <TrackControls key={m.id} memberId={m.id} />
      ))}
    </section>
  );
}
