import type { BalanceConfig, FighterStats } from "../types";

/** A red note's damage before pacing, the chorus, statuses and the target's defence. */
export function noteDamage(stats: FighterStats, velocity: number, crit: boolean, balance: BalanceConfig): number {
  return stats.baseDamage * (0.6 + 0.8 * velocity) * (crit ? balance.critMult : 1);
}

/** A green note's heal before pacing. */
export function noteHeal(stats: FighterStats, crit: boolean, balance: BalanceConfig): number {
  return stats.baseDamage * balance.healFactor * stats.healMult * (crit ? balance.critMult : 1);
}

/** Energy a hit gives before pacing and help. */
export function noteEnergy(stats: FighterStats, green: boolean, balance: BalanceConfig): number {
  return (green ? balance.energyGreen : balance.energyRed) * stats.energyMult;
}
