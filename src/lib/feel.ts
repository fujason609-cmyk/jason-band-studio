import type { MemberId } from "@/features/band/types";

/**
 * "Feel": how each member plays the written notes, so the band sounds like five
 * people instead of a sequencer, but five people who rehearse together: the band
 * locks to Ritsu, who pushes a little ahead of the beat, and Mio's bass sits right on
 * her kick. Everyone's own timing differs by a few milliseconds at most: much more and
 * fast songs sound as if each member were playing on their own. Pure maths; AudioTrack
 * applies the result.
 *
 *   ritsu   leads the push and hits the downbeats hard
 *   mio     locked to the kick, steady, even dynamics
 *   yui     big dynamics, a hair behind the band
 *   azusa   tight and clean, quick strums
 *   tsumugi gentle touch, soft dynamics
 */
export type FeelSetting = "character" | "steady";

export interface FeelProfile {
  /** constant timing offset in seconds; negative = ahead of the beat */
  pushSeconds: number;
  /** random timing spread (± seconds) */
  jitterSeconds: number;
  /** random velocity spread (±) */
  velocitySpread: number;
  /** velocity scale for the whole part */
  velocityScale: number;
  /** extra velocity on beat 1 and 3 (beat 1 only in odd meters) */
  downbeatAccent: number;
  /** gap between strings when a chord is strummed, in seconds */
  strumSeconds: number;
}

export const FEEL_PROFILES: Record<MemberId, FeelProfile> = {
  ritsu: { pushSeconds: -0.004, jitterSeconds: 0.003, velocitySpread: 0.1, velocityScale: 1.05, downbeatAccent: 0.15, strumSeconds: 0 },
  mio: { pushSeconds: -0.004, jitterSeconds: 0.0015, velocitySpread: 0.04, velocityScale: 1, downbeatAccent: 0.06, strumSeconds: 0.006 },
  yui: { pushSeconds: -0.002, jitterSeconds: 0.004, velocitySpread: 0.14, velocityScale: 1, downbeatAccent: 0.08, strumSeconds: 0.008 },
  azusa: { pushSeconds: -0.004, jitterSeconds: 0.002, velocitySpread: 0.06, velocityScale: 1, downbeatAccent: 0.06, strumSeconds: 0.006 },
  tsumugi: { pushSeconds: -0.003, jitterSeconds: 0.0025, velocitySpread: 0.06, velocityScale: 0.9, downbeatAccent: 0.04, strumSeconds: 0.003 },
};

/** No personality: on the grid, written velocities. Chords still roll a little so guitars sound strummed. */
export function profileFor(member: MemberId, feel: FeelSetting): FeelProfile {
  const p = FEEL_PROFILES[member];
  if (feel === "character") return p;
  return { pushSeconds: 0, jitterSeconds: 0, velocitySpread: 0, velocityScale: 1, downbeatAccent: 0, strumSeconds: p.strumSeconds };
}

export interface FeelInput {
  /** note start in Transport ticks */
  ticks: number;
  velocity: number;
  /** offset inside a strummed chord, from `strumOffsets` */
  strumIndex: number;
}

/**
 * Timing offset (seconds) and velocity for one note. `random` returns 0..1 and is a
 * parameter so tests can pin it; playback passes Math.random.
 */
export function humanize(profile: FeelProfile, note: FeelInput, ppq: number, random: () => number, beatsPerBar = 4) {
  const spread = (amount: number) => (random() * 2 - 1) * amount;
  // beats 1 and 3 in even bars (4/4, 2/4); only beat 1 in odd ones (3/4, 6/8, 5/4, 7/8)
  const inBar = note.ticks % (ppq * beatsPerBar);
  const strongBeat = inBar === 0 || (beatsPerBar % 2 === 0 && inBar % (ppq * 2) === 0);
  const offset = profile.pushSeconds + spread(profile.jitterSeconds) + note.strumIndex * profile.strumSeconds;
  const velocity =
    note.velocity * profile.velocityScale + spread(profile.velocitySpread) + (strongBeat ? profile.downbeatAccent : 0);
  return { offset, velocity: Math.min(1, Math.max(0.05, velocity)) };
}

/**
 * Notes that start on the same tick form a chord. Down-strums go low string to high;
 * chords on an off-beat eighth (straight or swung) are up-strums, high to low, like a strumming hand.
 * Returns each note's place in its strum (0 = first string hit).
 */
export function strumOffsets(notes: readonly { ticks: number; pitch: number }[], ppq: number): number[] {
  const byTick = new Map<number, number[]>();
  notes.forEach((n, i) => {
    const group = byTick.get(n.ticks);
    if (group) group.push(i);
    else byTick.set(n.ticks, [i]);
  });
  const result = new Array<number>(notes.length).fill(0);
  for (const [ticks, indices] of byTick) {
    if (indices.length < 2) continue;
    // the off-beat eighth, straight or swung (playStyle's swing moves it to 2/3 of the beat)
    const inBeat = ticks % ppq;
    const up = inBeat === ppq / 2 || inBeat === Math.round((ppq * 2) / 3);
    const ordered = [...indices].sort((a, b) => notes[a]!.pitch - notes[b]!.pitch);
    if (up) ordered.reverse();
    ordered.forEach((noteIndex, place) => {
      result[noteIndex] = place;
    });
  }
  return result;
}

/**
 * Keep a strum inside `maxRollSeconds` (from its first string to its last): at a fast
 * tempo a full-speed roll smears into the next chord, so the strings are brought closer
 * together. Returns each note's (possibly fractional) place in its strum.
 */
export function capStrums(
  notes: readonly { ticks: number }[],
  strums: readonly number[],
  strumSeconds: number,
  maxRollSeconds: number,
): number[] {
  const widest = new Map<number, number>();
  notes.forEach((n, i) => widest.set(n.ticks, Math.max(widest.get(n.ticks) ?? 0, strums[i]!)));
  return strums.map((place, i) => {
    const roll = widest.get(notes[i]!.ticks)! * strumSeconds;
    return roll > maxRollSeconds ? (place * maxRollSeconds) / roll : place;
  });
}
