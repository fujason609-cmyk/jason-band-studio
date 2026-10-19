import { AlertTriangle, LoaderCircle } from "lucide-react";
import { audioEngine } from "@/audio/AudioEngine";
import { Fader } from "@/components/common/Fader";
import { MemberBadge } from "@/features/band/components/MemberBadge";
import { INSTRUMENT_IDS, INSTRUMENT_LABELS, getMember, isInstrumentId } from "@/features/band/members";
import type { MemberId } from "@/features/band/types";
import { useStudioStore } from "@/stores/useStudioStore";
import { useInstrumentState, useMixerActions, useMixerTrack } from "./mixerStore";

export function TrackControls({ memberId }: { memberId: MemberId }) {
  const member = getMember(memberId);
  const track = useMixerTrack(memberId);
  const { setTrackVolume, toggleMute, toggleSolo, setInstrument } = useMixerActions();
  const load = useInstrumentState(memberId);
  const selected = useStudioStore((s) => s.settings.selectedMember === memberId);
  const selectMember = useStudioStore((s) => s.selectMember);
  const color = `var(${member.colorVar})`;

  return (
    <div
      className={`strip ${selected ? "is-selected" : ""} ${track.audible ? "" : "is-silent"}`}
      style={{ "--member": color } as React.CSSProperties}
    >
      <button
        type="button"
        className="strip__who"
        onClick={() => selectMember(memberId)}
        aria-pressed={selected}
        title={`Play ${member.name}'s instrument live`}
      >
        <MemberBadge member={member} />
        <span className="strip__names">
          <span className="strip__name">{member.name}</span>
          <span className="strip__role" lang="ja">
            {member.nameJa}
          </span>
        </span>
      </button>

      <div className="strip__controls">
        <select
          className="strip__instrument"
          aria-label={`${member.name}'s instrument`}
          value={track.instrument}
          onChange={(e) => {
            const v = e.currentTarget.value;
            if (isInstrumentId(v)) setInstrument(memberId, v);
          }}
        >
          {INSTRUMENT_IDS.map((id) => (
            <option key={id} value={id}>
              {INSTRUMENT_LABELS[id]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="ms-btn ms-btn--mute"
          aria-pressed={track.muted}
          aria-label={`Mute ${member.name}`}
          title={`Mute ${member.name}`}
          onClick={() => toggleMute(memberId)}
        >
          M
        </button>
        <button
          type="button"
          className="ms-btn ms-btn--solo"
          aria-pressed={track.solo}
          aria-label={`Solo ${member.name}`}
          title={`Solo ${member.name}`}
          onClick={() => toggleSolo(memberId)}
        >
          S
        </button>
      </div>

      <div className="strip__level">
        <Fader
          label={`${member.name} volume`}
          value={track.volume}
          onChange={(v) => setTrackVolume(memberId, v)}
          valueText={`${Math.round(track.volume * 100)}%`}
          color={color}
        />
        <LoadState state={load} onRetry={() => audioEngine.retryInstrument(track.instrument)} />
      </div>
      {track.noteCount === 0 && <p className="strip__empty">No part in this song</p>}
    </div>
  );
}

function LoadState({ state, onRetry }: { state: ReturnType<typeof useInstrumentState>; onRetry: () => void }) {
  if (!state || state.status === "ready" || state.status === "idle") return null;
  if (state.status === "loading") {
    return (
      <span className="load-state" role="status">
        <LoaderCircle size={14} className="spin" aria-hidden="true" />
        {Math.round(state.progress * 100)}%
      </span>
    );
  }
  return (
    <button type="button" className="load-state load-state--error" onClick={onRetry} title={state.error}>
      <AlertTriangle size={14} aria-hidden="true" />
      Retry
    </button>
  );
}
