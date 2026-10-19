/**
 * Computer-keyboard layout for melodic instruments, piano style:
 *   W E   T Y U   O P
 *  A S D F G H J K L ;
 * Z / X shift the octave down / up.
 */
const WHITE_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"];
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
const BLACK_KEYS: Record<string, number> = { w: 1, e: 3, t: 6, y: 8, u: 10, o: 13, p: 15 };

export const OCTAVE_DOWN_KEY = "z";
export const OCTAVE_UP_KEY = "x";
export const MIN_OCTAVE = 1;
export const MAX_OCTAVE = 6;

export function keyToSemitone(key: string): number | null {
  const k = key.toLowerCase();
  const white = WHITE_KEYS.indexOf(k);
  if (white >= 0) return WHITE_OFFSETS[white] ?? null;
  return BLACK_KEYS[k] ?? null;
}

/** MIDI pitch for a key at a given octave (C of that octave = 12 * (octave + 1)). */
export function keyToPitch(key: string, octave: number): number | null {
  const semitone = keyToSemitone(key);
  if (semitone === null) return null;
  const pitch = 12 * (octave + 1) + semitone;
  return pitch >= 0 && pitch <= 127 ? pitch : null;
}

export function pitchToKeyLabel(pitch: number, octave: number): string | null {
  const offset = pitch - 12 * (octave + 1);
  const white = WHITE_OFFSETS.indexOf(offset);
  if (white >= 0) return WHITE_KEYS[white]!.toUpperCase();
  const black = Object.entries(BLACK_KEYS).find(([, v]) => v === offset);
  return black ? black[0].toUpperCase() : null;
}

const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

export function pitchName(pitch: number): string {
  return `${NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

export function isBlackKey(pitch: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitch % 12);
}

/** Default octave that sits well for each instrument. */
export function defaultOctaveFor(instrument: string): number {
  if (instrument === "bass") return 2;
  if (instrument === "keys") return 4;
  return 3;
}

/** True when a keyboard event target is a text field we must not hijack. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["range", "checkbox", "radio", "button"].includes(type);
  }
  return false;
}
