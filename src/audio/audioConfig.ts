import type { InstrumentId } from "@/types/audio";

/** Transport resolution. Notes are scheduled in ticks at this PPQ. */
export const PPQ = 192;

/** Scheduling look-ahead in seconds — trades latency for glitch-free playback. */
export const LOOK_AHEAD = 0.1;

/**
 * Optional sample packs.
 *
 * By default every instrument is synthesized in the browser, which keeps the
 * repo small and avoids licensing questions. To use recorded samples, drop a
 * pack you are allowed to redistribute into `public/instruments/<instrument>/`
 * and describe it here. Keys are note names ("C3", "F#4"); for drums use the
 * General MIDI note of each hit ("C2" kick = 36, "D2" snare = 38, ...).
 *
 * Example:
 *   keys: { files: { C3: "C3.mp3", C4: "C4.mp3", C5: "C5.mp3" }, release: 1 },
 */
export interface SamplePack {
  files: Record<string, string>;
  /** release time in seconds */
  release?: number;
  /** level trim in dB */
  volume?: number;
  /** licence note shown in the README / credits — fill this in */
  license?: string;
}

export const SAMPLE_PACKS: Partial<Record<InstrumentId, SamplePack>> = {};

export function samplePackUrl(instrument: InstrumentId, file: string): string {
  return `${import.meta.env.BASE_URL}instruments/${instrument}/${file}`;
}

/** Output trims for the synthesized voices so the default mix sits together. */
export const SYNTH_TRIM_DB: Record<InstrumentId, number> = {
  "lead-guitar": -14,
  "rhythm-guitar": -20,
  bass: -8,
  drums: -6,
  keys: -12,
};
