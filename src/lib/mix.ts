import type { StudioTrack } from "@/types/project";

type MixState = Pick<StudioTrack, "id" | "muted" | "solo">;

/**
 * Mute / solo rules
 * - no track soloed: every un-muted track plays
 * - any track soloed: only soloed AND un-muted tracks play
 * Mute always wins, so a track that is both soloed and muted stays silent.
 */
export function isAudible(track: MixState, all: readonly MixState[]): boolean {
  if (track.muted) return false;
  const anySolo = all.some((t) => t.solo);
  return anySolo ? track.solo : true;
}

export function audibleMap(tracks: readonly MixState[]): Record<string, boolean> {
  return Object.fromEntries(tracks.map((t) => [t.id, isAudible(t, tracks)]));
}

/** Perceptual fader curve: slider 0..1 → decibels. */
export function gainToDb(gain: number): number {
  if (gain <= 0.0001) return -Infinity;
  return 20 * Math.log10(gain);
}
