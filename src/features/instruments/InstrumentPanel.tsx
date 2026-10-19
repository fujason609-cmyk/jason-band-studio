import { Minus, Plus } from "lucide-react";
import { IconButton } from "@/components/common/IconButton";
import { MemberBadge } from "@/features/band/components/MemberBadge";
import { INSTRUMENT_LABELS, getMember } from "@/features/band/members";
import { NARROW_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { MAX_OCTAVE, MIN_OCTAVE } from "@/lib/keyboardMap";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";
import { DrumPads } from "./DrumPads";
import { useKeyboardInput } from "./useKeyboardInput";
import { VirtualKeyboard } from "./VirtualKeyboard";

export function InstrumentPanel() {
  const memberId = useStudioStore((s) => s.settings.selectedMember);
  const instrument = useProjectStore((s) => s.project.tracks.find((t) => t.memberId === memberId)!.instrument);
  const member = getMember(memberId);
  const { octave, setOctave, active, press, release } = useKeyboardInput(memberId, instrument);
  const isDrums = instrument === "drums";
  const narrow = useMediaQuery(NARROW_QUERY);

  return (
    <section className="instrument" aria-label="Live instrument" style={{ "--member": `var(${member.colorVar})` } as React.CSSProperties}>
      <div className="instrument__head">
        <MemberBadge member={member} size="lg" />
        <div className="instrument__title">
          <h2>
            Play along as {member.name}
          </h2>
          <p>
            {INSTRUMENT_LABELS[instrument]}.{" "}
            {isDrums
              ? "Press A to L on your keyboard, or tap the pads."
              : "Keys A to ; play the white notes, W E T Y U O P the sharps. Z and X change octave."}
          </p>
        </div>
        {!isDrums && (
          <div className="octave" role="group" aria-label="Octave">
            <IconButton label="Octave down" variant="quiet" onClick={() => setOctave(Math.max(MIN_OCTAVE, octave - 1))} disabled={octave <= MIN_OCTAVE}>
              <Minus size={16} />
            </IconButton>
            <span className="octave__value" aria-live="polite">
              Octave {octave}
            </span>
            <IconButton label="Octave up" variant="quiet" onClick={() => setOctave(Math.min(MAX_OCTAVE, octave + 1))} disabled={octave >= MAX_OCTAVE}>
              <Plus size={16} />
            </IconButton>
          </div>
        )}
      </div>
      {isDrums ? (
        <DrumPads active={active} press={(s, p) => void press(s, p)} release={release} />
      ) : (
        <VirtualKeyboard octaves={narrow ? 1 : 2} octave={octave} active={active} press={(s, p) => void press(s, p)} release={release} />
      )}
    </section>
  );
}
