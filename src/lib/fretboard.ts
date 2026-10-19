import type { InstrumentId } from "@/types/audio";

/** Open-string pitches, lowest string first. */
export const GUITAR_TUNING = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
export const BASS_TUNING = [28, 33, 38, 43]; // E1 A1 D2 G2

/** Instruments played on a fretboard in the live panel. */
export function tuningFor(instrument: InstrumentId): number[] | null {
  if (instrument === "lead-guitar") return GUITAR_TUNING;
  if (instrument === "bass") return BASS_TUNING;
  return null;
}

/** Highest fret reachable in the live panel. */
export const MAX_FRET = 15;
/** Frets marked with an inlay dot (12 gets a double dot). */
export const INLAY_FRETS = [3, 5, 7, 9, 12, 15];

export function fretPitch(tuning: readonly number[], string: number, fret: number): number {
  return tuning[string]! + fret;
}

/** First fret of each visible window: 0, then shifting a few frets at a time. */
export function clampFretStart(start: number, visible: number): number {
  return Math.max(0, Math.min(MAX_FRET + 1 - visible, start));
}

export interface Chord {
  /** computer key that strums it */
  key: string;
  name: string;
  /** open-position voicing, lowest string first */
  pitches: number[];
}

/** Open chords for the rhythm guitar strum pads. */
export const CHORDS: Chord[] = [
  { key: "a", name: "C", pitches: [48, 52, 55, 60, 64] }, // x32010
  { key: "s", name: "G", pitches: [43, 47, 50, 55, 59, 67] }, // 320003
  { key: "d", name: "Am", pitches: [45, 52, 57, 60, 64] }, // x02210
  { key: "f", name: "F", pitches: [41, 48, 53, 57, 60, 65] }, // 133211
  { key: "g", name: "D", pitches: [50, 57, 62, 66] }, // xx0232
  { key: "h", name: "Em", pitches: [40, 47, 52, 55, 59, 64] }, // 022000
  { key: "j", name: "A", pitches: [45, 52, 57, 61, 64] }, // x02220
  { key: "k", name: "E", pitches: [40, 47, 52, 56, 59, 64] }, // 022100
  { key: "l", name: "Dm", pitches: [50, 57, 62, 65] }, // xx0231
];

/** Gap between strings in a down-strum, in milliseconds. */
export const STRUM_MS = 18;

export type LiveLayout = "piano" | "fretboard" | "chords" | "drums";

/** Which on-screen instrument the live panel shows. */
export function liveLayoutFor(instrument: InstrumentId): LiveLayout {
  if (instrument === "drums") return "drums";
  if (instrument === "rhythm-guitar") return "chords";
  if (tuningFor(instrument)) return "fretboard";
  return "piano";
}
