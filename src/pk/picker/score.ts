import { simulate } from "../sim/simulate";
import type { BattleInput, BattleResult, Side } from "../types";

/**
 * How good a fight is to watch, 0–1, from its numbers: the KO near 90% of the clip (30%), a
 * close fight (25%), the lead changing hands two or three times (20%), both specials fired
 * (15%) and a winner hanging on by a thread (10%).
 */
export interface FightScore {
  total: number;
  koTiming: number;
  closeness: number;
  leadChanges: number;
  specials: number;
  closeFinish: number;
}

/** Lead changes ignore gaps smaller than this (share of HP): a tie wobbling isn't a comeback. */
const LEAD_DEADBAND = 0.03;

export function fightStats(r: BattleResult) {
  const { start, end } = r.input.clip;
  const len = end - start;
  const share = (t: { L: number; R: number }) => ({ L: t.L / r.maxHp.L, R: t.R / r.maxHp.R });
  let gapSum = 0;
  let changes = 0;
  let leader: Side | null = null;
  for (const p of r.hpTrace) {
    const s = share(p);
    gapSum += Math.abs(s.L - s.R);
    const d = s.L - s.R;
    const now: Side | null = d > LEAD_DEADBAND ? "L" : d < -LEAD_DEADBAND ? "R" : leader;
    if (leader && now && now !== leader) changes += 1;
    leader = now;
  }
  const specials = { L: 0, R: 0 };
  for (const e of r.events) if (e.type === "special") specials[e.side] += 1;
  const last = r.events.filter((e) => e.type === "damage" || e.type === "heal");
  const hp = { L: r.maxHp.L, R: r.maxHp.R };
  for (const e of last) hp[e.target] = e.hpAfter;
  const winnerShare = r.winner ? hp[r.winner] / r.maxHp[r.winner] : 1;
  return {
    koShare: r.koTime === null ? null : (r.koTime - start) / len,
    meanGap: r.hpTrace.length ? gapSum / r.hpTrace.length : 1,
    changes,
    specials,
    winnerShare,
  };
}

export function scoreFight(r: BattleResult): FightScore {
  const s = fightStats(r);
  const koTiming = s.koShare === null ? 0 : Math.max(0, 1 - Math.abs(s.koShare - 0.9) / 0.25);
  const closeness = Math.max(0, 1 - s.meanGap / 0.5);
  const leadChanges = s.changes >= 2 && s.changes <= 3 ? 1 : s.changes === 1 || s.changes === 4 ? 0.6 : s.changes === 0 ? 0 : 0.4;
  const specials = s.specials.L > 0 && s.specials.R > 0 ? 1 : s.specials.L + s.specials.R > 0 ? 0.4 : 0;
  const closeFinish = s.winnerShare < 0.2 ? 1 : Math.max(0, 1 - (s.winnerShare - 0.2) / 0.3);
  return {
    total: 0.3 * koTiming + 0.25 * closeness + 0.2 * leadChanges + 0.15 * specials + 0.1 * closeFinish,
    koTiming,
    closeness,
    leadChanges,
    specials,
    closeFinish,
  };
}

export interface PickedFight {
  seed: number;
  winner: Side | null;
  koTime: number | null;
  score: FightScore;
}

/** How many fights the picker offers. */
export const PICKS = 5;

/**
 * Runs the fight for `count` seeds from `firstSeed` and keeps the best PICKS, best first;
 * with `winner`, only fights that side wins.
 */
export function pickFights(input: Omit<BattleInput, "seed">, firstSeed: number, count: number, winner: Side | null = null): PickedFight[] {
  const best: PickedFight[] = [];
  for (let k = 0; k < count; k++) {
    const seed = (firstSeed + k) >>> 0;
    const r = simulate({ ...input, seed });
    if (winner && r.winner !== winner) continue;
    const score = scoreFight(r);
    best.push({ seed, winner: r.winner, koTime: r.koTime, score });
    best.sort((a, b) => b.score.total - a.score.total);
    if (best.length > PICKS) best.pop();
  }
  return best;
}
