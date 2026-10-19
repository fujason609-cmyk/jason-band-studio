import { Minus, Plus } from "lucide-react";
import { IconButton } from "@/components/common/IconButton";
import { MemberBadge } from "@/features/band/components/MemberBadge";
import { getMember } from "@/features/band/members";
import { NARROW_QUERY, TOUCH_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { useT } from "@/i18n/useT";
import { MAX_FRET, liveLayoutFor, tuningFor, type LiveLayout } from "@/lib/fretboard";
import { MAX_OCTAVE, MIN_OCTAVE } from "@/lib/keyboardMap";
import type { Strings } from "@/i18n/strings";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";
import { ChordPads } from "./ChordPads";
import { DrumPads } from "./DrumPads";
import { Fretboard } from "./Fretboard";
import { MemberPicker } from "./MemberPicker";
import { useKeyboardInput } from "./useKeyboardInput";
import { VirtualKeyboard } from "./VirtualKeyboard";

function helpText(t: Strings, layout: LiveLayout, touch: boolean): string {
  switch (layout) {
    case "drums":
      return touch ? t.touchDrumsHelp : t.drumsHelp;
    case "chords":
      return touch ? t.touchChordsHelp : t.chordsHelp;
    case "fretboard":
      return touch ? t.touchFretHelp : t.fretHelp;
    case "piano":
      return touch ? t.touchHelp : t.keysHelp;
  }
}

/** Frets on screen (open string included) when the neck can't show all of them. */
const NARROW_FRETS = 6;

export function InstrumentPanel() {
  const memberId = useStudioStore((s) => s.settings.selectedMember);
  const instrument = useProjectStore((s) => s.project.tracks.find((t) => t.memberId === memberId)!.instrument);
  const member = getMember(memberId);
  const { octave, setOctave, active, activeChords, press, release, strum } = useKeyboardInput(memberId, instrument);
  const layout = liveLayoutFor(instrument);
  const narrow = useMediaQuery(NARROW_QUERY);
  const touch = useMediaQuery(TOUCH_QUERY);
  const t = useT();
  // On the fretboard the octave only moves the computer-keyboard notes, so touch screens don't need it.
  const showOctave = layout === "piano" || (layout === "fretboard" && !touch);
  const onPress = (s: string, p: number) => void press(s, p);

  return (
    <section
      className={`instrument instrument--${layout}`}
      aria-label={t.liveInstrument}
      style={{ "--member": `var(${member.colorVar})` } as React.CSSProperties}
    >
      <MemberPicker />
      <div className="instrument__head">
        <MemberBadge member={member} size="lg" />
        <div className="instrument__title">
          <h2>{t.playAlongAs(t.memberName[memberId])}</h2>
          <p>
            {t.instrument[instrument]} · {helpText(t, layout, touch)}
          </p>
        </div>
        {showOctave && (
          <div className="octave" role="group" aria-label={t.octaveGroup}>
            <IconButton label={t.octaveDown} variant="quiet" onClick={() => setOctave(Math.max(MIN_OCTAVE, octave - 1))} disabled={octave <= MIN_OCTAVE}>
              <Minus size={16} />
            </IconButton>
            <span className="octave__value" aria-live="polite">
              {t.octave(octave)}
            </span>
            <IconButton label={t.octaveUp} variant="quiet" onClick={() => setOctave(Math.min(MAX_OCTAVE, octave + 1))} disabled={octave >= MAX_OCTAVE}>
              <Plus size={16} />
            </IconButton>
          </div>
        )}
      </div>
      {layout === "drums" && <DrumPads active={active} press={onPress} release={release} />}
      {layout === "chords" && <ChordPads activeChords={activeChords} strum={strum} release={release} />}
      {layout === "fretboard" && (
        <Fretboard
          key={instrument}
          tuning={tuningFor(instrument)!}
          visible={narrow ? NARROW_FRETS : MAX_FRET + 1}
          active={active}
          press={onPress}
          release={release}
        />
      )}
      {layout === "piano" && (
        <VirtualKeyboard octaves={narrow ? 1 : 2} octave={octave} active={active} press={onPress} release={release} />
      )}
    </section>
  );
}
