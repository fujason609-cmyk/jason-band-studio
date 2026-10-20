import type { VocalRole } from "@/features/band/vocals";
import type { InstrumentId } from "@/types/audio";
import type { KeysPatch } from "./keysPatches";
import { SAMPLE_FILES } from "./samplePacks.generated";

/** Transport resolution. Notes are scheduled in ticks at this PPQ. */
export const PPQ = 192;

/** Scheduling look-ahead in seconds — trades latency for glitch-free playback. */
export const LOOK_AHEAD = 0.1;

/**
 * Recorded sample packs in `public/instruments/<instrument>/`, built by
 * `pnpm samples:build` (scripts/build-sample-packs.ts) from CC0 libraries; credits in
 * public/instruments/CREDITS.md. Keys are note names ("C3", "Eb4"); drums are keyed by
 * the General MIDI note of each kit piece ("C2" kick = 36, "D2" snare = 38, ...).
 * An instrument without a pack, or whose pack fails to load, uses its synth voice.
 */
export interface SamplePack {
  files: Record<string, string>;
  /** release time in seconds */
  release?: number;
  /** level trim in dB */
  volume?: number;
  /** where the recordings come from and under what licence */
  license: string;
  /** softer recordings of the same notes, played for velocities below `below` */
  soft?: { files: Record<string, string>; below: number };
}

const KARORYFER = "CC0-1.0, Karoryfer Samples via sfzinstruments on GitHub";

// volumes set like SYNTH_TRIM_DB: offline renders of the same phrase, matched to the same RMS targets
export const SAMPLE_PACKS: Partial<Record<InstrumentId, SamplePack>> = {
  // Yui's Les Paul → an Epiphone solid body with humbuckers
  "lead-guitar": { files: SAMPLE_FILES["lead-guitar"]!, release: 0.3, volume: -13, license: `${KARORYFER} (Emilyguitar, Epiphone)` },
  // Azusa's Mustang → the brighter Hofner (no free Fender single-coil recordings exist)
  "rhythm-guitar": { files: SAMPLE_FILES["rhythm-guitar"]!, release: 0.12, volume: -11, license: `${KARORYFER} (Black And Green Guitars, Hofner)` },
  // Mio's Jazz Bass → a Squier Jazz Bass
  bass: { files: SAMPLE_FILES.bass!, release: 0.12, volume: -3, license: `${KARORYFER} (Growlybass, Squier Jazz Bass)` },
  keys: {
    files: SAMPLE_FILES.keys!,
    // quiet playing uses the piano's soft-hammer recordings, not the loud ones turned down
    soft: { files: SAMPLE_FILES["keys:soft"]!, below: 0.45 },
    release: 0.8,
    volume: -14,
    license: "CC0-1.0, Versilian Studios and Karoryfer Samples (Osiris Piano)",
  },
  // hits ring out on their own; the short release is only the hi-hat choke
  drums: { files: SAMPLE_FILES.drums!, release: 0.08, volume: -2, license: `${KARORYFER} (Big Rusty Drums)` },
};

export function samplePackUrl(instrument: InstrumentId, file: string): string {
  return `${import.meta.env.BASE_URL}instruments/${instrument}/${file}`;
}

/** Level trims for the singing voices, measured like SYNTH_TRIM_DB (lead about -24 dBFS RMS, harmony a little under). */
export const VOCAL_TRIM_DB: Record<VocalRole, number> = {
  lead: -13,
  harmony: -15.5,
};

/** Level trims for Mugi's synthesized Triton patches, measured like SYNTH_TRIM_DB. */
export const KEYS_PATCH_TRIM_DB: Record<Exclude<KeysPatch, "piano">, number> = {
  strings: -21.5,
  synth: -22,
  organ: -24.5,
};

/**
 * Output trims for the synthesized voices so the default mix sits together. Set from
 * offline renders of a short phrase per instrument, aiming at RMS (dBFS) of about:
 * drums -27, bass -24, lead guitar -25, rhythm guitar -27, keys -28.
 */
export const SYNTH_TRIM_DB: Record<InstrumentId, number> = {
  "lead-guitar": -11,
  "rhythm-guitar": -10,
  bass: -17,
  drums: -6,
  keys: -20,
};
