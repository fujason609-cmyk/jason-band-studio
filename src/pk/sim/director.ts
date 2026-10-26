import { ROSTER, SKILLS } from "../roster";
import type { BalanceConfig, BattleInput, Side, SongNote } from "../types";
import { noteDamage, noteHeal } from "./damage";

/**
 * The director keeps a fight watchable without picking its winner: it paces the damage so
 * the first KO lands near the end of the clip (`koTarget`), helps whoever is far behind, stops
 * the fight ending early, hits harder in the chorus, and calls TIME UP if no one falls. The
 * pacing is worked out before the fight from the expected values (no dice), so it is the
 * same for every seed; the seeds only change what happens within it.
 */
export interface Pace {
  /** damage and heals aimed at each side are multiplied by this (the attacker's pace) */
  damage: Record<Side, number>;
  /** energy each side gains on a beat in good form (before her own multiplier and help) */
  energy: Record<Side, number>;
  /**
   * How far along each side should be at `t` with her damage: the share of the damage she is
   * expected to have dealt by the KO target (past 1 after it). The director drives her
   * damage towards it.
   */
  progress: Record<Side, (t: number) => number>;
  /**
   * The damage each side is expected to have landed by the KO target (before shields, and
   * counting what the opponent heals back): her progress is what she has landed over this.
   */
  due: Record<Side, number>;
  /** what one of her counted notes is worth on average, before pacing: her form starts here */
  expected: Record<Side, { red: number; green: number }>;
}

export const other = (s: Side): Side => (s === "L" ? "R" : "L");

/** Which notes count (the rest still show): each side's notes at least its minGap apart. */
export function countedNotes(input: BattleInput): { side: Side | null; counted: boolean }[] {
  const last: Record<Side, number> = { L: -Infinity, R: -Infinity };
  return input.notes.map((n) => {
    const side: Side | null = n.lane === input.left ? "L" : n.lane === input.right ? "R" : null;
    if (!side) return { side, counted: false };
    const gap = ROSTER[side === "L" ? input.left : input.right].minGap;
    const counted = n.time - last[side] >= gap - 1e-9;
    if (counted) last[side] = n.time;
    return { side, counted };
  });
}

export function inChorus(input: BattleInput, t: number): boolean {
  return input.sections.some((s) => s.kind === "chorus" && t >= s.start && t < s.end);
}

/** The chorus boost at `t`. */
export function chorusBoost(input: BattleInput, t: number): number {
  return inChorus(input, t) ? input.balance.chorusBoost : 1;
}

/** Expected crit multiplier of a note: Azusa on the beat always, Yui's combo a little more. */
function critAverage(member: BattleInput["left"], note: SongNote, b: BalanceConfig): number {
  const chance =
    member === "azusa" && note.isDownbeat ? 1 : Math.min(1, b.baseCrit + (member === "yui" ? SKILLS.yuiComboCrit * 0.6 : 0));
  return 1 + (b.critMult - 1) * chance;
}

/**
 * HP a member's specials are expected to save her by the KO target (Mugi's tea, Mio's
 * shield), so the pace still brings her down on time.
 */
function specialGuard(member: BattleInput["left"], b: BalanceConfig): number {
  const count = (b.specialsTarget * b.koTarget * ROSTER[member].energyMult) / b.specialsBy;
  return b.guardShare * count * (member === "tsumugi" ? SKILLS.teaHeal : member === "mio" ? SKILLS.shieldHp : 0);
}

/**
 * The beats damage lands on (each fighter once per beat): the clip's beats, or every half
 * second when there are none.
 */
export function volleyTimes(input: BattleInput): number[] {
  const { start, end } = input.clip;
  const beats = input.beats.filter((t) => t > start - 1e-9 && t < end);
  if (beats.length) return beats;
  return Array.from({ length: Math.ceil((end - start) / 0.5) }, (_, k) => start + k * 0.5);
}

export function pace(input: BattleInput, counted = countedNotes(input)): Pace {
  const b = input.balance;
  const ids: Record<Side, BattleInput["left"]> = { L: input.left, R: input.right };
  const target = input.clip.start + b.koTarget * (input.clip.end - input.clip.start);
  const charged = input.clip.start + b.specialsBy * (input.clip.end - input.clip.start);
  // what one of her counted notes is worth on average (damage, heal), and the energy she
  // is expected to have by `charged`
  const red: Record<Side, number> = { L: 0, R: 0 };
  const green: Record<Side, number> = { L: 0, R: 0 };
  const count: Record<Side, number> = { L: 0, R: 0 };
  input.notes.forEach((n, i) => {
    const c = counted[i]!;
    if (!c.side || !c.counted || n.time < input.clip.start) return;
    const st = ROSTER[ids[c.side]];
    red[c.side] += st.hitRate * (1 - st.greenShare) * noteDamage(st, n.velocity, false, b) * critAverage(ids[c.side], n, b);
    green[c.side] += st.hitRate * st.greenShare * noteHeal(st, false, b) * (1 + (b.critMult - 1) * b.baseCrit);
    count[c.side] += 1;
  });
  for (const s of ["L", "R"] as const) {
    red[s] = count[s] ? red[s] / count[s] : noteDamage(ROSTER[ids[s]], 0.7, false, b);
    green[s] = count[s] ? green[s] / count[s] : 0;
  }
  // both land on the same beats: the schedule is the beats (the chorus's count for more)
  const volleys = volleyTimes(input);
  const weights = volleys.map((t) => chorusBoost(input, t));
  const sums: number[] = [];
  weights.reduce((acc, w, k) => (sums[k] = acc + w), 0);
  const byTarget = volleys.reduce((acc, t, k) => (t <= target ? sums[k]! : acc), 0) || 1;
  const nByTarget = Math.max(1, volleys.filter((t) => t <= target).length);
  const scale: Record<Side, number> = { L: 1, R: 1 };
  const dealt: Record<Side, number> = { L: 0, R: 0 };
  for (const s of ["L", "R"] as const) {
    const o = other(s);
    // most of a defence is made up for by the pace (or Mio would always outlast); the rest is her edge
    const def = Math.pow(ROSTER[ids[o]].defense, 1 - b.defenseEdge);
    dealt[s] = red[s] * byTarget * def;
  }
  // heals are in the healer's own units (her damage pace: a heal is worth her green notes
  // against her red ones, whoever she fights; in her opponent's, a member with weak hits
  // like Ritsu made every heal against her huge), and what the opponent heals back is more
  // to get through
  const bare = (s: Side) => (dealt[s] > 0 ? ROSTER[ids[other(s)]].maxHp / dealt[s] : 1);
  for (const s of ["L", "R"] as const) {
    const o = other(s);
    const healed = green[o] * nByTarget * bare(o);
    scale[s] = dealt[s] > 0 ? (ROSTER[ids[o]].maxHp + specialGuard(ids[o], b) + healed) / dealt[s] : 1;
  }
  // evenness 1: each side on her own pace; 0: one pace (the geometric mean) for both
  const mean = Math.sqrt(scale.L * scale.R);
  const e = b.paceEvenness;
  const damage = {
    L: Math.pow(scale.L, e) * Math.pow(mean, 1 - e),
    R: Math.pow(scale.R, e) * Math.pow(mean, 1 - e),
  };
  // energy charges on the beats too, the same for both: a special each by `charged` on average
  // (by her notes, a part with few, or none until late, never got to fire one)
  const perBeat = (100 * b.specialsTarget) / Math.max(1, volleys.filter((t) => t <= charged).length);
  const energyScale = { L: perBeat, R: perBeat };
  // the share of the schedule due by t: the beats so far (past the target, on at the same rate)
  const progress = (t: number) => {
    let lo = 0;
    let hi = volleys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (volleys[mid]! <= t) lo = mid + 1;
      else hi = mid;
    }
    return (lo > 0 ? sums[lo - 1]! : 0) / byTarget;
  };
  const due = { L: damage.L * dealt.L, R: damage.R * dealt.R };
  return { damage, energy: energyScale, progress: { L: progress, R: progress }, due, expected: { L: { red: red.L, green: green.L }, R: { red: red.R, green: green.R } } };
}

/** Far behind (by HP share): this side gets help. */
export function trailing(hp: Record<Side, number>, maxHp: Record<Side, number>, b: BalanceConfig): Side | null {
  const gap = hp.L / maxHp.L - hp.R / maxHp.R;
  if (gap > b.comebackGap) return "R";
  if (-gap > b.comebackGap) return "L";
  return null;
}

/**
 * In the clip's first part no hit takes a fighter below the floor (a fight over in 5 s is no
 * fight), and before `noKoBefore` she hangs on by a thread.
 */
export function earlyFloor(input: BattleInput, t: number, hpBefore: number, hpAfter: number, maxHp: number): number {
  const b = input.balance;
  const share = (t - input.clip.start) / (input.clip.end - input.clip.start);
  const floor = share < b.earlyShare ? b.earlyFloor * maxHp : share < b.noKoBefore ? b.lastStand * maxHp : 0;
  return hpAfter >= floor ? hpAfter : Math.max(hpAfter, Math.min(hpBefore, floor));
}

/** When TIME UP is called if no one has fallen. */
export function timeUpAt(input: BattleInput): number {
  return input.clip.end - input.balance.timeUpSeconds;
}

/**
 * The director's hand on a hit: behind schedule (she has landed less than her share of the
 * expected damage by now), the hit lands harder; ahead, softer. Both fighters run on their
 * own schedule, so the fight stays close and the first KO comes near the target, and who
 * falls first is down to the dice and the members' skills. Progress counts what she landed,
 * not the target's HP: by HP, a heal or a shield only made the next hits harder, undoing it.
 */
export function drive(b: BalanceConfig, expected: number, done: number): number {
  return Math.min(b.driveMax, Math.max(b.driveMin, 1 + b.driveGain * (expected - done)));
}
