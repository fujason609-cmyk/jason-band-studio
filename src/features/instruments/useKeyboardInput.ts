import { useCallback, useEffect, useRef, useState } from "react";
import { audioEngine } from "@/audio/AudioEngine";
import type { MemberId } from "@/features/band/types";
import { ensureAudio } from "@/hooks/useAudioEngine";
import { DRUM_PADS } from "@/lib/drums";
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
 */
export function useKeyboardInput(member: MemberId, instrument: InstrumentId) {
  const [octave, setOctave] = useState(() => defaultOctaveFor(instrument));
  const [active, setActive] = useState<ReadonlySet<number>>(() => new Set());
  const held = useRef(new Map<string, number>());
  const isDrums = instrument === "drums";

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

  const release = useCallback(
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

  const releaseAll = useCallback(() => {
    held.current.clear();
    audioEngine.allNotesOff(member);
    setActive(new Set());
  }, [member]);

  // Changing who plays or what they play: stop hanging notes, reset the octave.
  useEffect(() => {
    setOctave(defaultOctaveFor(instrument));
    return () => releaseAll();
  }, [instrument, releaseAll]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
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
      if (!e.repeat) void press(`key:${key}`, pitch);
    };
    const onUp = (e: KeyboardEvent) => release(`key:${e.key.toLowerCase()}`);
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
  }, [isDrums, octave, press, release, releaseAll]);

  return { octave, setOctave, active, press, release };
}
