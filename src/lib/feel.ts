import type { MemberId } from "@/features/band/types";

/**
 * "Feel": how each member plays the written notes, so the band sounds like five
 * people instead of a sequencer. Pure maths; AudioTrack applies the result.
 *
 *   ritsu   pushes ahead of the beat and hits the downbeats hard
 *   mio     steady as a rock, even dynamics
 *   yui     big dynamics, sometimes lays back a little
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
  /** extra velocity on beat 1 and 3 */
  downbeatAccent: number;
  /** gap between strings when a chord is strummed, in seconds */
  strumSeconds: number;
}

export const FEEL_PROFILES: Record<MemberId, FeelProfile> = {
  ritsu: { pushSeconds: -0.008, jitterSeconds: 0.006, velocitySpread: 0.1, velocityScale: 1.05, downbeatAccent: 0.15, strumSeconds: 0 },
  mio: { pushSeconds: 0, jitterSeconds: 0.002, velocitySpread: 0.04, velocityScale: 1, downbeatAccent: 0.04, strumSeconds: 0.008 },
  yui: { pushSeconds: 0.005, jitterSeconds: 0.01, velocitySpread: 0.16, velocityScale: 1, downbeatAccent: 0.08, strumSeconds: 0.014 },
  azusa: { pushSeconds: 0, jitterSeconds: 0.003, velocitySpread: 0.06, velocityScale: 1, downbeatAccent: 0.06, strumSeconds: 0.009 },
  tsumugi: { pushSeconds: 0, jitterSeconds: 0.004, velocitySpread: 0.06, velocityScale: 0.9, downbeatAccent: 0.03, strumSeconds: 0.004 },
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
export function humanize(profile: FeelProfile, note: FeelInput, ppq: number, random: () => number) {
  const spread = (amount: number) => (random() * 2 - 1) * amount;
  const strongBeat = note.ticks % (ppq * 2) === 0; // beats 1 and 3 in 4/4
  const offset = profile.pushSeconds + spread(profile.jitterSeconds) + note.strumIndex * profile.strumSeconds;
  const velocity =
    note.velocity * profile.velocityScale + spread(profile.velocitySpread) + (strongBeat ? profile.downbeatAccent : 0);
  return { offset, velocity: Math.min(1, Math.max(0.05, velocity)) };
}

/**
 * Notes that start on the same tick form a chord. Down-strums go low string to high;
 * chords on an off-beat eighth are up-strums, high to low, like a strumming hand.
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
    const up = ticks % ppq === ppq / 2;
    const ordered = [...indices].sort((a, b) => notes[a]!.pitch - notes[b]!.pitch);
    if (up) ordered.reverse();
    ordered.forEach((noteIndex, place) => {
      result[noteIndex] = place;
    });
  }
  return result;
}
