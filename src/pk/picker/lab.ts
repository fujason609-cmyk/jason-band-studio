import { FIGHTER_ORDER } from "../roster";
import { simulate } from "../sim/simulate";
import type { BattleInput, MemberId } from "../types";
import { fightStats } from "./score";

/**
 * The balance lab: every pair of members on every song for many seeds, summed up. Tune
 * roster.ts until these land in TARGETS rather than by watching fights one at a time.
 */
export interface LabReport {
  fights: number;
  /** wins[a][b]: share of a's fights against b that she won */
  wins: Record<MemberId, Partial<Record<MemberId, number>>>;
  meanKoShare: number;
  timeUpRate: number;
  /** KO between 80% and 95% of the clip */
  koInWindow: number;
  /** at least one lead change */
  comebackRate: number;
  bothSpecials: number;
  meanChanges: number;
  /**
   * The same, song by song: the share of (song, pair) win rates inside the target range, and
   * the worst one. Summed over many songs the rates can look even while each song is lopsided
   * (one member's part much busier than the other's won 94–100% before the fighters struck on
   * shared beats), so this is the number that says a fight is fair.
   */
  songPairsInRange: number;
  worst: { song: number; winner: MemberId; loser: MemberId; rate: number } | null;
}

export const TARGETS = {
  winRate: [0.35, 0.65],
  songPairsInRange: 0.9,
  timeUpRate: 0.1,
  koInWindow: 0.6,
  comebackRate: 0.5,
  bothSpecials: 0.7,
} as const;

/** All ten pairs, in roster order. */
export function pairs(): [MemberId, MemberId][] {
  const out: [MemberId, MemberId][] = [];
  FIGHTER_ORDER.forEach((a, i) => FIGHTER_ORDER.slice(i + 1).forEach((b) => out.push([a, b])));
  return out;
}

/**
 * `inputFor(song, left, right)` builds the fight without a seed; each pair plays `seeds`
 * seeds per song, half of them with the sides swapped.
 */
export function runLab<S>(
  songs: readonly S[],
  inputFor: (song: S, left: MemberId, right: MemberId) => Omit<BattleInput, "seed">,
  seeds: number,
  onProgress?: (done: number, total: number) => void,
): LabReport {
  const won = new Map<string, number>();
  const played = new Map<string, number>();
  let fights = 0;
  let koSum = 0;
  let koCount = 0;
  let timeUps = 0;
  let inWindow = 0;
  let comebacks = 0;
  let both = 0;
  let changes = 0;
  let inRange = 0;
  let cells = 0;
  let worst: LabReport["worst"] = null;
  const all = pairs();
  const total = all.length * songs.length;
  let done = 0;
  for (const [a, b] of all) {
    for (const [si, song] of songs.entries()) {
      let aWins = 0;
      let decided = 0;
      const ab = inputFor(song, a, b);
      const ba = inputFor(song, b, a);
      for (let k = 0; k < seeds; k++) {
        const swap = k % 2 === 1;
        const r = simulate({ ...(swap ? ba : ab), seed: 1000 + k });
        const s = fightStats(r);
        fights += 1;
        const key = (x: MemberId, y: MemberId) => `${x}>${y}`;
        played.set(key(a, b), (played.get(key(a, b)) ?? 0) + 1);
        played.set(key(b, a), (played.get(key(b, a)) ?? 0) + 1);
        if (r.winner) {
          const w = r.winner === "L" ? r.input.left : r.input.right;
          const l = w === a ? b : a;
          won.set(key(w, l), (won.get(key(w, l)) ?? 0) + 1);
          decided += 1;
          if (w === a) aWins += 1;
        }
        if (s.koShare === null) timeUps += 1;
        else {
          koSum += s.koShare;
          koCount += 1;
          if (s.koShare >= 0.8 && s.koShare <= 0.95) inWindow += 1;
        }
        if (s.changes > 0) comebacks += 1;
        changes += s.changes;
        if (s.specials.L > 0 && s.specials.R > 0) both += 1;
      }
      if (decided > 0) {
        const rate = aWins / decided;
        cells += 1;
        if (rate >= TARGETS.winRate[0] && rate <= TARGETS.winRate[1]) inRange += 1;
        const off = Math.abs(rate - 0.5);
        if (!worst || off > Math.abs(worst.rate - 0.5)) worst = rate >= 0.5 ? { song: si, winner: a, loser: b, rate } : { song: si, winner: b, loser: a, rate: 1 - rate };
      }
      onProgress?.(++done, total);
    }
  }
  const wins = Object.fromEntries(FIGHTER_ORDER.map((m) => [m, {}])) as LabReport["wins"];
  for (const [a, b] of all) {
    wins[a][b] = (won.get(`${a}>${b}`) ?? 0) / Math.max(1, played.get(`${a}>${b}`) ?? 0);
    wins[b][a] = (won.get(`${b}>${a}`) ?? 0) / Math.max(1, played.get(`${b}>${a}`) ?? 0);
  }
  const n = Math.max(1, fights);
  return {
    fights,
    wins,
    meanKoShare: koCount ? koSum / koCount : 0,
    timeUpRate: timeUps / n,
    koInWindow: inWindow / n,
    comebackRate: comebacks / n,
    bothSpecials: both / n,
    meanChanges: changes / n,
    songPairsInRange: cells ? inRange / cells : 1,
    worst,
  };
}
