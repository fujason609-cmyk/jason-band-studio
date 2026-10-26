import { ROSTER, SKILLS } from "../roster";
import type { BattleEvent, BattleInput, BattleResult, MemberId, NoteColor, Side, SkillId, StatusEffect } from "../types";
import { noteDamage, noteHeal } from "./damage";
import { chorusBoost, countedNotes, drive, earlyFloor, other, pace, timeUpAt, trailing, volleyTimes } from "./director";
import { makeRng } from "./rng";

/** Statuses that tea time clears. */
const BAD: readonly StatusEffect[] = ["panic", "stunned", "daydream"];
const TRACE_STEP = 0.25;

/** Something due later: a status running out, or one of Yui's rapid-fire hits. */
type Action =
  | { t: number; kind: "expire"; side: Side; effect: StatusEffect }
  | { t: number; kind: "gitah"; side: Side }
  | { t: number; kind: "volley" };

interface Fighter {
  id: MemberId;
  hp: number;
  maxHp: number;
  energy: number;
  combo: number;
  /** a status and when it ends (Infinity: until something ends it) */
  status: Map<StatusEffect, number>;
  shieldLeft: number;
  perfectLeft: number;
  lastColor: NoteColor;
}

/**
 * Plays the fight out: a pure function of its input (no clock, no DOM, no Math.random), so
 * the same seed always gives the same fight and the picker can run hundreds in a worker.
 * The notes are taken in time order; each counted one comes up red (damage to the opponent)
 * or green (a heal), hits or misses, crits. They set her form; on every beat both fighters
 * strike with their form and charge their energy by it, and full energy fires her special.
 * So how many notes a part has, and when, decides how the fight looks, not who wins it.
 */
export function simulate(input: BattleInput): BattleResult {
  const rng = makeRng(input.seed);
  const b = input.balance;
  const { start, end } = input.clip;
  const counted = countedNotes(input);
  const p = pace(input, counted);
  const f: Record<Side, Fighter> = {
    L: fighter(input.left),
    R: fighter(input.right),
  };
  const maxHp = { L: f.L.maxHp, R: f.R.maxHp };
  const events: BattleEvent[] = [];
  const hpTrace: BattleResult["hpTrace"] = [];
  const actions: Action[] = [];
  let nextTrace = start;
  /** damage each side has landed (before shields): her progress for the director */
  const landed = { L: 0, R: 0 };
  let over: { winner: Side | null; ko: number | null } | null = null;
  const upAt = timeUpAt(input);
  /**
   * Each side's form: what her latest notes were worth (raw damage and heal, a running
   * average). Both sides strike on the same beats with it, so a busy part (more, smaller
   * hits) and one resting at the end fight on equal terms; dealing each note's damage as it
   * came, the busier part landed the last blow first and won nearly every close fight
   * (Don't say "lazy": Yui's 160 notes beat Mugi's 37 in 100 fights of 100).
   */
  const form: Record<Side, { red: number; green: number; crit: boolean }> = {
    L: { ...p.expected.L, crit: false },
    R: { ...p.expected.R, crit: false },
  };
  /** her notes since the last beat: what they were worth, summed, and how many */
  const beat: Record<Side, { red: number; green: number; notes: number }> = {
    L: { red: 0, green: 0, notes: 0 },
    R: { red: 0, green: 0, notes: 0 },
  };
  const play = (side: Side, red: number, green: number) => {
    beat[side].red += red;
    beat[side].green += green;
    beat[side].notes += 1;
  };
  /**
   * On the beat her form moves towards the average of that beat's notes (once a beat, not
   * once a note: a miss costs a busy part no more than a sparse one); a beat she rests keeps it.
   */
  const settle = (side: Side) => {
    const n = beat[side];
    if (n.notes > 0) {
      const w = b.formWeight;
      form[side].red = form[side].red * (1 - w) + (n.red / n.notes) * w;
      form[side].green = form[side].green * (1 - w) + (n.green / n.notes) * w;
    }
    beat[side] = { red: 0, green: 0, notes: 0 };
  };

  const queue = (a: Action) => {
    let k = actions.length;
    while (k > 0 && actions[k - 1]!.t > a.t) k--;
    actions.splice(k, 0, a);
  };
  const trace = (until: number) => {
    while (nextTrace <= until + 1e-9 && nextTrace <= end + 1e-9) {
      hpTrace.push({ t: nextTrace, L: f.L.hp, R: f.R.hp });
      nextTrace += TRACE_STEP;
    }
  };
  const setStatus = (t: number, side: Side, effect: StatusEffect, until: number) => {
    const had = f[side].status.has(effect);
    f[side].status.set(effect, Math.max(until, f[side].status.get(effect) ?? -Infinity));
    if (!had) events.push({ t, type: "status", side, effect, on: true });
    if (Number.isFinite(until)) queue({ t: until, kind: "expire", side, effect });
  };
  const clearStatus = (t: number, side: Side, effect: StatusEffect) => {
    if (!f[side].status.delete(effect)) return;
    events.push({ t, type: "status", side, effect, on: false });
    if (effect === "shield") f[side].shieldLeft = 0;
    if (effect === "perfect") f[side].perfectLeft = 0;
  };
  const has = (side: Side, effect: StatusEffect) => f[side].status.has(effect);
  /** Azusa's cat ears come with low HP and go when she's healed back up. */
  const catEars = (t: number, side: Side) => {
    const x = f[side];
    if (x.id !== "azusa") return;
    const share = x.hp / x.maxHp;
    if (x.hp > 0 && share < SKILLS.catEarsBelow && !has(side, "catEars")) setStatus(t, side, "catEars", Infinity);
    else if (share >= SKILLS.catEarsOff && has(side, "catEars")) clearStatus(t, side, "catEars");
  };

  const damage = (t: number, from: Side, raw: number, crit: boolean, source: "notes" | "special") => {
    const to = other(from);
    const target = f[to];
    let amount = raw * p.damage[from] * chorusBoost(input, t);
    if (has(from, "catEars")) amount *= SKILLS.catEarsBoost;
    amount *= drive(b, p.progress[from](t), p.due[from] > 0 ? landed[from] / p.due[from] : 1);
    // Mio's defence: the pace and the director make up for all but its `defenseEdge` share
    const defense = ROSTER[target.id].defense;
    amount *= defense;
    let absorbed = 0;
    if (target.shieldLeft > 0) {
      absorbed = Math.min(target.shieldLeft, amount);
      target.shieldLeft -= absorbed;
      amount -= absorbed;
      if (target.shieldLeft <= 1e-9) clearStatus(t, to, "shield");
    }
    const before = target.hp;
    target.hp = Math.max(0, earlyFloor(input, t, before, before - amount, target.maxHp));
    events.push({ t, type: "damage", target: to, amount: before - target.hp, hpAfter: target.hp, crit, absorbed, source });
    // what really came off, or hit her shield (held back by the floor, it is still to come)
    landed[from] += (before - target.hp + absorbed) / Math.pow(defense, b.defenseEdge);
    if (target.id === "mio" && before - target.hp > SKILLS.mioPanicOver) setStatus(t, to, "panic", t + SKILLS.panicSeconds);
    catEars(t, to);
    if (target.hp <= 0) {
      events.push({ t, type: "ko", winner: from });
      over = { winner: from, ko: t };
    }
  };
  const heal = (t: number, side: Side, raw: number) => {
    const x = f[side];
    const before = x.hp;
    // heals in her own units: her green notes against her red ones
    x.hp = Math.min(x.maxHp, x.hp + raw * p.damage[side]);
    events.push({ t, type: "heal", target: side, amount: x.hp - before, hpAfter: x.hp });
    catEars(t, side);
  };
  const special = (t: number, side: Side, skill: SkillId) => {
    events.push({ t, type: "special", side, skill });
    const x = f[side];
    const o = other(side);
    switch (skill) {
      case "gitah":
        for (let k = 0; k < SKILLS.gitahHits; k++) queue({ t: t + (k * SKILLS.gitahSeconds) / (SKILLS.gitahHits - 1), kind: "gitah", side });
        break;
      case "resonance":
        x.shieldLeft = SKILLS.shieldHp;
        setStatus(t, side, "shield", t + SKILLS.shieldSeconds);
        break;
      case "storm":
        setStatus(t, o, "stunned", t + SKILLS.stormSeconds);
        break;
      case "teaTime":
        for (const e of BAD) clearStatus(t, side, e);
        setStatus(t, side, "teaTime", t + SKILLS.teaShow);
        heal(t, side, SKILLS.teaHeal / p.damage[side]);
        break;
      case "perfectBeat":
        x.perfectLeft = SKILLS.perfectNotes;
        setStatus(t, side, "perfect", Infinity);
        break;
    }
  };
  const runActions = (until: number) => {
    while (!over && actions.length && actions[0]!.t <= until) {
      const a = actions.shift()!;
      if (a.t > upAt) {
        actions.unshift(a);
        return;
      }
      trace(a.t);
      if (a.kind === "expire") {
        // a later setting may have pushed it on
        const ends = f[a.side].status.get(a.effect);
        if (ends !== undefined && ends <= a.t + 1e-9) clearStatus(a.t, a.side, a.effect);
      } else if (a.kind === "gitah") {
        damage(a.t, a.side, noteDamage(ROSTER[f[a.side].id], 0.8, false, b) * SKILLS.gitahPower, false, "special");
      } else {
        // the beat: both strike with their form, heals first, in an order the dice pick (both
        // could fall on the same beat: then it's a coin toss)
        const order: Side[] = rng() < 0.5 ? ["L", "R"] : ["R", "L"];
        settle("L");
        settle("R");
        for (const s of order) if (form[s].green > 1e-6) heal(a.t, s, form[s].green);
        for (const s of order) if (form[s].red > 1e-6 && !over) damage(a.t, s, form[s].red, form[s].crit, "notes");
        form.L.crit = false;
        form.R.crit = false;
        // and each charges her energy by how well she has been playing; full, her special
        for (const s of order) {
          if (over) break;
          const x = f[s];
          const exp = p.expected[s].red + p.expected[s].green;
          const quality = exp > 0 ? Math.min(1.5, (form[s].red + form[s].green) / exp) : 1;
          const behind = trailing({ L: f.L.hp, R: f.R.hp }, maxHp, b) === s;
          x.energy = Math.min(100, x.energy + p.energy[s] * quality * ROSTER[x.id].energyMult * (behind ? b.comebackEnergy : 1));
          events.push({ t: a.t, type: "charge", side: s, energy: x.energy });
          if (x.energy >= 100 - 1e-9) {
            x.energy = 0;
            special(a.t, s, ROSTER[x.id].skill);
          }
        }
      }
    }
  };

  // a moment after each beat, so a note right on it lands with it
  for (const t of volleyTimes(input)) if (t + 1e-4 <= upAt) queue({ t: t + 1e-4, kind: "volley" });

  for (let i = 0; i < input.notes.length && !over; i++) {
    const n = input.notes[i]!;
    const c = counted[i]!;
    if (!c.side || n.time < start || n.time > end) continue;
    if (n.time > upAt) break;
    runActions(n.time);
    if (over) break;
    trace(n.time);
    const side = c.side;
    const x = f[side];
    if (!c.counted) {
      events.push({ t: n.time, type: "noteSpawn", side, color: x.lastColor, noteIdx: i, counted: false });
      continue;
    }
    const behind = trailing({ L: f.L.hp, R: f.R.hp }, maxHp, b) === side;
    const st = ROSTER[x.id];
    const color: NoteColor = rng() < st.greenShare + (behind ? b.comebackGreen : 0) ? "green" : "red";
    x.lastColor = color;
    events.push({ t: n.time, type: "noteSpawn", side, color, noteIdx: i, counted: true });
    const daydream = x.id === "yui" && rng() < SKILLS.yuiDaydream;
    const hitRate = st.hitRate - (has(side, "panic") ? SKILLS.panicHitPenalty : 0);
    const roll = rng();
    const reason = has(side, "stunned") ? "stunned" : daydream ? "daydream" : roll >= hitRate ? (has(side, "panic") ? "panic" : "miss") : null;
    if (reason) {
      x.combo = 0;
      play(side, 0, 0);
      events.push({ t: n.time, type: "noteMiss", side, reason, noteIdx: i, combo: 0 });
      if (reason === "daydream") setStatus(n.time, side, "daydream", n.time + SKILLS.daydreamShow);
      continue;
    }
    x.combo += 1;
    let crit: boolean;
    if (x.perfectLeft > 0) {
      crit = true;
      x.perfectLeft -= 1;
    } else if (x.id === "azusa" && n.isDownbeat) {
      crit = true;
    } else {
      crit = rng() < b.baseCrit + (x.id === "yui" && x.combo >= SKILLS.yuiComboAt ? SKILLS.yuiComboCrit : 0);
    }
    const green = color === "green";
    const raw = green ? noteHeal(st, crit, b) : noteDamage(st, n.velocity, crit, b);
    const value = raw * p.damage[side];
    events.push({ t: n.time, type: "noteHit", side, color, crit, value, noteIdx: i, energy: x.energy, combo: x.combo });
    // it moves her form, which strikes on the next beat
    play(side, green ? 0 : raw, green ? raw : 0);
    if (crit && !green) form[side].crit = true;
    if (x.perfectLeft === 0 && has(side, "perfect")) clearStatus(n.time, side, "perfect");
    if (over) break;
  }
  if (!over) runActions(upAt);
  if (!over) {
    trace(upAt);
    const l = f.L.hp / f.L.maxHp;
    const r = f.R.hp / f.R.maxHp;
    const winner: Side | null = Math.abs(l - r) < 1e-9 ? null : l > r ? "L" : "R";
    events.push({ t: upAt, type: "timeUp", winner });
    over = { winner, ko: null };
  }
  const done = over as { winner: Side | null; ko: number | null };
  trace(done.ko ?? upAt);
  events.sort((a, c) => a.t - c.t);
  return { input, events, winner: done.winner, koTime: done.ko, hpTrace, maxHp };
}

function fighter(id: MemberId): Fighter {
  const st = ROSTER[id];
  return { id, hp: st.maxHp, maxHp: st.maxHp, energy: 0, combo: 0, status: new Map(), shieldLeft: 0, perfectLeft: 0, lastColor: "red" };
}
