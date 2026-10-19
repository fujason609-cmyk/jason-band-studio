import { MEMBERS } from "@/features/band/members";
import { useT } from "@/i18n/useT";
import { TrackControls } from "./TrackControls";
import { useAnySolo, useMixerActions } from "./mixerStore";

export function TrackMixer() {
  const anySolo = useAnySolo();
  const { clearSolo } = useMixerActions();
  const t = useT();
  return (
    <section className="mixer" aria-label={t.bandMixer}>
      <div className="mixer__head">
        <h2>{t.theBand}</h2>
        {anySolo && (
          <button type="button" className="link-btn" onClick={clearSolo}>
            {t.clearSolo}
          </button>
        )}
      </div>
      {MEMBERS.map((m) => (
        <TrackControls key={m.id} memberId={m.id} />
      ))}
    </section>
  );
}
