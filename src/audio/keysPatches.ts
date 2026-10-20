/**
 * Mugi's KORG Triton: the sounds she reaches for in the band, picked from the live
 * panel. "piano" is the recorded grand; the others are synthesized workstation patches.
 * They apply to every keys track, for playback and live playing alike.
 */
export type KeysPatch = "piano" | "strings" | "synth" | "organ";

export const KEYS_PATCHES: KeysPatch[] = ["piano", "strings", "synth", "organ"];

export function isKeysPatch(value: unknown): value is KeysPatch {
  return typeof value === "string" && (KEYS_PATCHES as string[]).includes(value);
}
