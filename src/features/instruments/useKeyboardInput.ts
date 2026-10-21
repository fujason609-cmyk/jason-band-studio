import { useCallback, useEffect, useRef, useState } from "react";
import { audioEngine } from "@/audio/AudioEngine";
import type { MemberId } from "@/features/band/types";
import { ensureAudio } from "@/hooks/useAudioEngine";
import { DRUM_PADS } from "@/lib/drums";
import { CHORDS, STRUM_MS, liveLayoutFor, type Chord } from "@/lib/fretboard";
import {
  MAX_OCTAVE,
  MIN_OCTAVE,
  OCTAVE_DOWN_KEY,
  OCTAVE_UP_KEY,
  defaultOctaveFor,
  isTypingTarget,
  keyToPitch,
} from "@/lib/keyboardMap";
import type { InstrumentId } from "@/types/audio";

/**
 * Live playing for the selected member. Notes can come from the computer keyboard
 * or from pointer presses on the on-screen instrument; each source is tracked so a
 * release always stops the exact pitch it started, even after an octave change.
 * A strummed chord is one source with a sub-source per string ("src|0", "src|1", ...).
 */
export function useKeyboardInput(member: MemberId, instrument: InstrumentId) {
  const [octave, setOctave] = useState(() => defaultOctaveFor(instrument));
  const [active, setActive] = useState<ReadonlySet<number>>(() => new Set());
  const [activeChords, setActiveChords] = useState<ReadonlySet<string>>(() => new Set());
  const held = useRef(new Map<string, number>());
  const strums = useRef(new Map<string, { chord: string; timers: ReturnType<typeof setTimeout>[] }>());
  const layout = liveLayoutFor(instrument);
  const isDrums = layout === "drums";

  const press = useCallback(
    async (source: string, pitch: number) => {
      if (held.current.has(source)) return;
      held.current.set(source, pitch);
      if (!audioEngine.isStarted && !(await ensureAudio())) {
        held.current.delete(source);
        return;
      }
      if (held.current.get(source) !== pitch) return; // released while audio was starting
      audioEngine.noteOn(member, pitch);
      setActive((prev) => new Set(prev).add(pitch));
      if (isDrums) {
        // drums are one-shots: light the pad briefly
        setTimeout(() => setActive((prev) => {
          const next = new Set(prev);
          if (![...held.current.values()].includes(pitch)) next.delete(pitch);
          return next;
        }), 140);
      }
    },
    [member, isDrums],
  );

  const releaseOne = useCallback(
    (source: string) => {
      const pitch = held.current.get(source);
      if (pitch === undefined) return;
      held.current.delete(source);
      if ([...held.current.values()].includes(pitch)) return;
      audioEngine.noteOff(member, pitch);
      setActive((prev) => {
        const next = new Set(prev);
        next.delete(pitch);
        return next;
      });
    },
    [member],
  );

  /** Stop a source, including every string of a chord it strummed. */
  const release = useCallback(
    (source: string) => {
      releaseOne(source);
      const strum = strums.current.get(source);
      if (!strum) return;
      strum.timers.forEach(clearTimeout);
      strums.current.delete(source);
      [...held.current.keys()].filter((k) => k.startsWith(`${source}|`)).forEach(releaseOne);
      setActiveChords((prev) => {
        const next = new Set(prev);
        if (![...strums.current.values()].some((s) => s.chord === strum.chord)) next.delete(strum.chord);
        return next;
      });
    },
    [releaseOne],
  );

  /** Down-strum: lowest string first, a few milliseconds apart. */
  const strum = useCallback(
    (source: string, chord: Chord) => {
      if (strums.current.has(source)) return;
      const timers = chord.pitches.map((pitch, i) =>
        setTimeout(() => void press(`${source}|${i}`, pitch), i * STRUM_MS),
      );
      strums.current.set(source, { chord: chord.name, timers });
      setActiveChords((prev) => new Set(prev).add(chord.name));
    },
    [press],
  );

  const releaseAll = useCallback(() => {
    strums.current.forEach((s) => s.timers.forEach(clearTimeout));
    strums.current.clear();
    held.current.clear();
    audioEngine.allNotesOff(member);
    setActive(new Set());
    setActiveChords(new Set());
  }, [member]);

  // Changing who plays or what they play: stop hanging notes, reset the octave.
  useEffect(() => {
    setOctave(defaultOctaveFor(instrument));
    return () => releaseAll();
  }, [instrument, releaseAll]);

  useEffect(() => {
    // a held key is tracked by the physical key, not the character: Shift turns ";" into ":"
    // between keydown and keyup, and the note would never stop
    const sourceOf = (e: KeyboardEvent) => `key:${e.code || e.key.toLowerCase()}`;
    const onDown = (e: KeyboardEvent) => {
      // on a Mac, keys let go while Cmd is held send no keyup: stop everything now
      if (e.key === "Meta") return releaseAll();
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (layout === "chords") {
        const chord = CHORDS.find((c) => c.key === key);
        if (!chord) return;
        e.preventDefault();
        if (!e.repeat) strum(sourceOf(e), chord);
        return;
      }
      let pitch: number | null = null;
      if (isDrums) {
        pitch = DRUM_PADS.find((p) => p.key === key)?.pitch ?? null;
      } else if (key === OCTAVE_DOWN_KEY || key === OCTAVE_UP_KEY) {
        e.preventDefault();
        if (!e.repeat) {
          setOctave((o) => Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, o + (key === OCTAVE_UP_KEY ? 1 : -1))));
        }
        return;
      } else {
        pitch = keyToPitch(key, octave);
      }
      if (pitch === null) return;
      e.preventDefault();
      if (!e.repeat) void press(sourceOf(e), pitch);
    };
    const onUp = (e: KeyboardEvent) => release(sourceOf(e));
    const onBlur = () => releaseAll();
    const onVisibility = () => document.hidden && releaseAll();
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [layout, isDrums, octave, press, release, releaseAll, strum]);

  return { octave, setOctave, active, activeChords, press, release, strum };
}
