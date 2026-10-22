import { drumVoiceFor } from "@/lib/drums";
import type { NoteEvent } from "@/types/midi";

/**
 * How lively the music is, for the recording frame's look (pure). `energy` (0–1) is the
 * number of notes starting around a moment against the song's busiest stretches: the
 * dot grid brightens and twinkles with it, so the chorus looks like the chorus. `breath`
 * (0–1) is the push of a crash, or of the downbeat of a busy bar: the frame swells a
 * little with it and settles back.
 */

/** Energy is counted per half bar, then smoothed across neighbours. */
const SLOTS_PER_BAR = 2;
/** The song's 90th-percentile slot counts as full energy (a few dense fills don't set the scale). */
const FULL_AT = 0.9;
/** How long the frame takes to settle after a crash. */
export const BREATH_SECONDS = 0.35;

interface EnergyMap {
  slot: number;
  values: Float32Array;
}

let last: { parts: readonly (readonly NoteEvent[])[]; slot: number; map: EnergyMap } | null = null;

function energyMap(parts: readonly (readonly NoteEvent[])[], barSeconds: number): EnergyMap {
  const slot = barSeconds / SLOTS_PER_BAR;
  if (last && last.slot === slot && last.parts.length === parts.length && last.parts.every((p, i) => p === parts[i])) return last.map;
  let end = 0;
  for (const p of parts) for (const n of p) end = Math.max(end, n.start);
  const count = new Float32Array(Math.max(1, Math.ceil(end / slot) + 1));
  for (const p of parts) for (const n of p) count[Math.floor(n.start / slot)]! += 1;
  // a little smoothing, so a single empty beat doesn't drop the lights
  const smooth = count.map((c, i) => (2 * c + (count[i - 1] ?? c) + (count[i + 1] ?? c)) / 4);
  const sorted = [...smooth].filter((v) => v > 0).sort((a, b) => a - b);
  const full = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * FULL_AT))] ?? 1;
  const values = smooth.map((v) => Math.min(1, v / Math.max(1, full)));
  const map = { slot, values };
  last = { parts, slot, map };
  return map;
}

/** Energy (0–1) at `position` (song seconds), eased between half bars. */
export function energyAt(parts: readonly (readonly NoteEvent[])[], barSeconds: number, position: number): number {
  const { slot, values } = energyMap(parts, barSeconds);
  const x = Math.max(0, position / slot - 0.5);
  const i = Math.floor(x);
  const a = values[i] ?? 0;
  const b = values[i + 1] ?? a;
  return a + (b - a) * (x - i);
}

/**
 * The swell (0–1) at `position`: the latest crash at full strength, or a kick on a bar's
 * downbeat when the music is busy, fading out over BREATH_SECONDS.
 */
export function breathAt(drums: readonly NoteEvent[], barSeconds: number, position: number, energy: number): number {
  let strength = 0;
  // drum parts are sorted by start: walk back from the playhead
  let lo = 0;
  let hi = drums.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (drums[mid]!.start <= position) lo = mid + 1;
    else hi = mid;
  }
  for (let k = lo - 1; k >= 0; k--) {
    const n = drums[k]!;
    const age = position - n.start;
    if (age >= BREATH_SECONDS) break;
    const fade = 1 - age / BREATH_SECONDS;
    const voice = drumVoiceFor(n.pitch);
    if (voice === "crash") strength = Math.max(strength, n.velocity * fade);
    else if (voice === "kick") {
      const inBar = n.start / barSeconds - Math.round(n.start / barSeconds);
      if (Math.abs(inBar) < 0.02) strength = Math.max(strength, 0.5 * energy * n.velocity * fade);
    }
  }
  return strength;
}

/** How much the frame swells at full breath. */
export const BREATH_SCALE = 0.018;
