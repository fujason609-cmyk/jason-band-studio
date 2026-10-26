import type { MemberId } from "@/features/band/types";

/**
 * PK mode: two members battle to the music. Three layers trade only these types: the
 * simulator (`sim/`) turns a BattleInput into a BattleResult (pure, seeded: the same input
 * always gives the same fight), the picker (`picker/`) runs it over many seeds and scores
 * the fights, and the renderer (`render/`) only reads the result's event timeline at the
 * time the audio clock says. All times here are real seconds of the song (at the playing
 * tempo), from the song's start.
 */
export type { MemberId };
export type NoteColor = "red" | "green";
export type Side = "L" | "R";

/** A note of one fighter's part, from the song's tracks. */
export interface SongNote {
  /** real seconds */
  time: number;
  duration: number;
  /** whose part it is (her own instrument's track, or the tune standing in for it) */
  lane: MemberId;
  pitch: number;
  /** 0–1: scales the damage */
  velocity: number;
  /** on a beat (Azusa's sure crit) */
  isDownbeat: boolean;
}

export interface SongSection {
  start: number;
  end: number;
  kind: "intro" | "verse" | "chorus" | "bridge" | "outro";
}

export interface BattleInput {
  songId: string;
  /** both fighters' notes, sorted by time */
  notes: SongNote[];
  sections: SongSection[];
  /**
   * The song's beats in the clip (real seconds). Both fighters' hits land together on each
   * beat: with each note dealing its damage at once, the busier part (more, smaller hits)
   * landed the last blow first and won almost every close fight.
   */
  beats: number[];
  /** the stretch fought over (about 15 s) */
  clip: { start: number; end: number };
  left: MemberId;
  right: MemberId;
  seed: number;
  balance: BalanceConfig;
}

/** The numbers the fight runs on; one per member in roster.ts. */
export interface FighterStats {
  maxHp: number;
  /** damage of a red note before pacing */
  baseDamage: number;
  /** share of notes that come up green (heal) */
  greenShare: number;
  hitRate: number;
  /** notes closer than this to her last counted one still show, but don't count */
  minGap: number;
  /** energy gained per hit is multiplied by this (Ritsu) */
  energyMult: number;
  /** damage she takes is multiplied by this (Mio) */
  defense: number;
  /** her heals are multiplied by this (Mugi) */
  healMult: number;
}

export interface BalanceConfig {
  critMult: number;
  baseCrit: number;
  energyRed: number;
  energyGreen: number;
  /** a green note heals baseDamage × this */
  healFactor: number;
  /** the director aims the first KO at this share of the clip */
  koTarget: number;
  /** how many specials a fighter should be ready for by `specialsBy` (share of the clip), on average */
  specialsTarget: number;
  specialsBy: number;
  /** 1: each side is paced to KO its opponent at the target; 0: one pace for both (denser parts win) */
  paceEvenness: number;
  /** how much of a defence (Mio's) the pace leaves her as an edge: 0 none (made up for), 1 all */
  defenseEdge: number;
  /** the share of the HP her specials are expected to save (tea, shield) that the pace makes up for */
  guardShare: number;
  /** the trailing side gets help when the HP gap (as a share) is bigger than this */
  comebackGap: number;
  comebackEnergy: number;
  comebackGreen: number;
  /** in the clip's first share, no hit takes a fighter below this share of her HP */
  earlyShare: number;
  earlyFloor: number;
  /** and until this share no hit is a KO (she hangs on with `lastStand` of her HP): the KO comes in the last seconds */
  noKoBefore: number;
  lastStand: number;
  chorusBoost: number;
  /** the director drives each hit by 1 + gain × (how far behind schedule), within these bounds */
  driveGain: number;
  /**
   * Each beat she deals her form: a running average of what her notes were worth, moved this
   * share of the way to each beat's notes. A miss, a storm or a crit shows in the next beats.
   */
  formWeight: number;
  driveMin: number;
  driveMax: number;
  /** no KO this long before the clip's end: the fuller HP bar wins ("TIME UP") */
  timeUpSeconds: number;
}

export type StatusEffect = "daydream" | "panic" | "shield" | "stunned" | "catEars" | "perfect" | "teaTime";

export interface FighterState {
  id: MemberId;
  side: Side;
  hp: number;
  maxHp: number;
  energy: number;
  combo: number;
  status: StatusEffect[];
}

export type MissReason = "daydream" | "panic" | "stunned" | "miss";

export type BattleEvent =
  | { t: number; type: "noteSpawn"; side: Side; color: NoteColor; noteIdx: number; counted: boolean }
  | {
      t: number;
      type: "noteHit";
      side: Side;
      color: NoteColor;
      crit: boolean;
      value: number;
      noteIdx: number;
      /** her energy and combo after it */
      energy: number;
      combo: number;
    }
  | { t: number; type: "noteMiss"; side: Side; reason: MissReason; noteIdx: number; combo: number }
  | { t: number; type: "damage"; target: Side; amount: number; hpAfter: number; crit: boolean; absorbed: number; source: "notes" | "special" }
  | { t: number; type: "heal"; target: Side; amount: number; hpAfter: number }
  | { t: number; type: "special"; side: Side; skill: SkillId }
  /** her energy after a beat's charge */
  | { t: number; type: "charge"; side: Side; energy: number }
  | { t: number; type: "status"; side: Side; effect: StatusEffect; on: boolean }
  | { t: number; type: "ko"; winner: Side }
  | { t: number; type: "timeUp"; winner: Side | null };

export type SkillId = "gitah" | "resonance" | "storm" | "teaTime" | "perfectBeat";

export interface BattleResult {
  input: BattleInput;
  /** sorted by time */
  events: BattleEvent[];
  /** null: a dead heat at TIME UP */
  winner: Side | null;
  koTime: number | null;
  /** a point every 0.25 s, for scoring */
  hpTrace: { t: number; L: number; R: number }[];
  maxHp: Record<Side, number>;
}
