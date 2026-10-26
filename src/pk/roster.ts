import type { BalanceConfig, FighterStats, MemberId, SkillId } from "./types";

/**
 * Each member's way of fighting, from her character: Yui bursts (and daydreams), Mio
 * defends (and panics), Ritsu is fast, Mugi heals, Azusa is precise. Tune the numbers here
 * only, and check them in the balance lab (/#/pk/lab, or `pnpm pk lab`).
 */
export const ROSTER: Record<MemberId, FighterStats & { skill: SkillId }> = {
  // a crit run once her combo gets going; now and then her mind wanders off and she misses
  yui: { maxHp: 100, baseDamage: 6, greenShare: 0.2, hitRate: 0.88, minGap: 0.15, energyMult: 1, defense: 1, healMult: 1, skill: "gitah" },
  // takes less, but a big hit sends her into a panic
  mio: { maxHp: 120, baseDamage: 4, greenShare: 0.25, hitRate: 0.92, minGap: 0.15, energyMult: 1, defense: 0.8, healMult: 1, skill: "resonance" },
  // the most notes counted, and more energy from each
  ritsu: { maxHp: 95, baseDamage: 3, greenShare: 0.15, hitRate: 0.9, minGap: 0.08, energyMult: 1.2, defense: 1, healMult: 1, skill: "storm" },
  // heals more
  tsumugi: { maxHp: 110, baseDamage: 4, greenShare: 0.4, hitRate: 0.9, minGap: 0.15, energyMult: 1, defense: 1, healMult: 1.3, skill: "teaTime" },
  // sure crits on the beat; cat ears when she's low
  azusa: { maxHp: 100, baseDamage: 5, greenShare: 0.2, hitRate: 0.96, minGap: 0.15, energyMult: 1, defense: 1, healMult: 1, skill: "perfectBeat" },
};

/** Passives and specials, in numbers. */
export const SKILLS = {
  /** Yui: combo of this many or more → crit chance up */
  yuiComboAt: 5,
  yuiComboCrit: 0.45,
  yuiDaydream: 0.04,
  /** Gitah! rapid fire: hits over seconds, each this many red notes' worth */
  gitahHits: 6,
  gitahSeconds: 0.8,
  gitahPower: 1.3,
  /** Mio: one hit bigger than this sends her into a panic (hit rate down) */
  mioPanicOver: 10,
  panicSeconds: 2,
  panicHitPenalty: 0.23,
  /** Bass resonance: a shield that absorbs this much for this long */
  shieldHp: 27,
  shieldSeconds: 3,
  /** Drum storm: every note the opponent plays for this long is knocked away */
  stormSeconds: 1.85,
  /** Tea time: heals this much and clears the bad statuses */
  teaHeal: 28,
  teaShow: 1.2,
  /** Azusa: below this share of her HP, cat ears (damage up) */
  catEarsBelow: 0.3,
  /** …and they stay until she is healed back over this (or they would flicker with every heal) */
  catEarsOff: 0.4,
  catEarsBoost: 1.2,
  /** Perfect beat: her next notes all crit */
  perfectNotes: 2,
  /** How long a daydream "?" stays up after a miss */
  daydreamShow: 0.6,
} as const;

export const DEFAULT_BALANCE: BalanceConfig = {
  critMult: 1.8,
  baseCrit: 0.1,
  energyRed: 6,
  energyGreen: 4,
  healFactor: 0.96,
  koTarget: 0.69,
  specialsTarget: 1.05,
  specialsBy: 0.7,
  paceEvenness: 1,
  guardShare: 0.2,
  defenseEdge: 0.04,
  comebackGap: 0.3,
  comebackEnergy: 1.5,
  comebackGreen: 0.11,
  earlyShare: 0.6,
  earlyFloor: 0.25,
  noKoBefore: 0.8,
  lastStand: 0.03,
  chorusBoost: 1.3,
  driveGain: 4.9,
  formWeight: 0.43,
  driveMin: 0.5,
  driveMax: 2.5,
  timeUpSeconds: 1,
};

/** The instrument each member fights with (her own track). */
export const FIGHTER_ORDER: readonly MemberId[] = ["yui", "mio", "ritsu", "tsumugi", "azusa"];
