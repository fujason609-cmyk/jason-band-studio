import type { BattleEvent, BattleResult, Side, SkillId, StatusEffect } from "../types";

/** A bolt takes this long from the hit line to the opponent; her HP drops when it lands. */
export const BOLT_SECONDS = 0.18;
/** How long a hit's number floats, a special's banner shows, and the KO slows things down. */
export const NUMBER_SECONDS = 0.8;
export const SPECIAL_SECONDS = 1.3;
export const KO_SLOWMO = 0.5;

export interface SideState {
  hp: number;
  /** HP a moment ago: the white chunk that drains after a hit */
  hpLag: number;
  maxHp: number;
  energy: number;
  combo: number;
  status: Map<StatusEffect, number>;
  /** the last hit she took / landed: age in seconds (Infinity: none) */
  hurtAge: number;
  attackAge: number;
}

export interface BattleState {
  sides: Record<Side, SideState>;
  /** damage and heal numbers still floating */
  numbers: { side: Side; amount: number; heal: boolean; crit: boolean; age: number; absorbed: boolean }[];
  /** bolts on their way: from the hitter's line to the target */
  bolts: { from: Side; age: number; crit: boolean; special: boolean }[];
  specials: { side: Side; skill: SkillId; age: number }[];
  /** the end: a KO (age since) or TIME UP */
  end: { kind: "ko" | "timeUp"; winner: Side | null; age: number } | null;
  /** a crit or a special landing: how hard the screen shakes, 0–1 */
  shake: number;
}

/**
 * Everything the picture shows at `now` (real song seconds), read off the event timeline:
 * the renderer never works out a fight itself, so the video always shows the fight that
 * was simulated. A damage event's HP shows when its bolt lands (BOLT_SECONDS later).
 */
export function battleStateAt(r: BattleResult, now: number): BattleState {
  const side = (s: Side): SideState => ({
    hp: r.maxHp[s],
    hpLag: r.maxHp[s],
    maxHp: r.maxHp[s],
    energy: 0,
    combo: 0,
    status: new Map(),
    hurtAge: Infinity,
    attackAge: Infinity,
  });
  const st: BattleState = { sides: { L: side("L"), R: side("R") }, numbers: [], bolts: [], specials: [], end: null, shake: 0 };
  for (const e of r.events) {
    // a hit shows when its bolt lands, and so does the KO it makes
    const shown = e.type === "damage" || e.type === "ko" ? e.t + BOLT_SECONDS : e.t;
    if (shown > now) {
      if (e.t > now) break;
      // a bolt in flight: its damage hasn't landed yet
      if (e.type === "damage") st.bolts.push({ from: e.target === "L" ? "R" : "L", age: now - e.t, crit: e.crit, special: e.source === "special" });
      continue;
    }
    apply(st, e, now);
  }
  return st;
}

function apply(st: BattleState, e: BattleEvent, now: number) {
  switch (e.type) {
    case "noteHit": {
      const s = st.sides[e.side];
      s.combo = e.combo;
      s.attackAge = now - e.t;
      if (e.crit && now - e.t < 0.15) st.shake = Math.max(st.shake, 0.5 * (1 - (now - e.t) / 0.15));
      break;
    }
    case "charge":
      st.sides[e.side].energy = e.energy;
      break;
    case "noteMiss":
      st.sides[e.side].combo = 0;
      break;
    case "damage": {
      const s = st.sides[e.target];
      const at = e.t + BOLT_SECONDS;
      const age = now - at;
      // the white chunk: HP from before this hit, draining over 0.5 s (the chunk of an earlier
      // hit still draining stays)
      const before = s.hp;
      s.hp = e.hpAfter;
      const chunk = age < 0.5 ? before - (before - e.hpAfter) * (age / 0.5) ** 2 : e.hpAfter;
      s.hpLag = Math.max(Math.min(s.hpLag, before), chunk);
      s.hurtAge = age;
      if (age < NUMBER_SECONDS && (e.amount > 0.05 || e.absorbed > 0))
        st.numbers.push({ side: e.target, amount: e.amount, heal: false, crit: e.crit, age, absorbed: e.amount <= 0.05 });
      break;
    }
    case "heal": {
      const s = st.sides[e.target];
      s.hp = e.hpAfter;
      s.hpLag = Math.min(s.hpLag, s.hp);
      const age = now - e.t;
      // a beat's trickle of healing shows on the bar; only a real heal gets a number (a "+1"
      // over both every beat was noise)
      if (age < NUMBER_SECONDS && e.amount >= 2) st.numbers.push({ side: e.target, amount: e.amount, heal: true, crit: false, age, absorbed: false });
      break;
    }
    case "special": {
      st.sides[e.side].energy = 0;
      const age = now - e.t;
      if (age < SPECIAL_SECONDS) st.specials.push({ side: e.side, skill: e.skill, age });
      if (age < 0.25) st.shake = Math.max(st.shake, 0.8 * (1 - age / 0.25));
      break;
    }
    case "status":
      if (e.on) st.sides[e.side].status.set(e.effect, e.t);
      else st.sides[e.side].status.delete(e.effect);
      break;
    case "ko":
      st.end = { kind: "ko", winner: e.winner, age: now - e.t - BOLT_SECONDS };
      if (now - e.t - BOLT_SECONDS < 0.3) st.shake = 1;
      break;
    case "timeUp":
      st.end = { kind: "timeUp", winner: e.winner, age: now - e.t };
      break;
    case "noteSpawn":
      break;
  }
}
