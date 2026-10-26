import { DEFAULT_BALANCE, ROSTER, SKILLS } from "../roster";
import type { BattleEvent, BattleInput, MemberId, Side, SongNote } from "../types";
import { countedNotes, earlyFloor, pace } from "./director";
import { makeRng } from "./rng";
import { simulate } from "./simulate";

/** Both members playing a note every `step` s over a 15 s clip (on the beat at 120 BPM every other one). */
function fight(left: MemberId, right: MemberId, seed: number, extra: Partial<BattleInput> = {}, step = 0.25): BattleInput {
  const notes: SongNote[] = [];
  for (let t = 0; t < 15; t += step) {
    for (const lane of [left, right]) {
      notes.push({ time: t, duration: step, lane, pitch: 60 + Math.round(t * 3) % 12, velocity: 0.7, isDownbeat: Math.round(t / step) % 2 === 0 });
    }
  }
  return {
    songId: "test",
    notes,
    beats: Array.from({ length: 30 }, (_, k) => k * 0.5),
    sections: [
      { start: 0, end: 7, kind: "verse" },
      { start: 7, end: 15, kind: "chorus" },
    ],
    clip: { start: 0, end: 15 },
    left,
    right,
    seed,
    balance: DEFAULT_BALANCE,
    ...extra,
  };
}

const of = <T extends BattleEvent["type"]>(events: BattleEvent[], type: T) =>
  events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);

describe("PK simulator", () => {
  it("seeds its own random numbers", () => {
    const a = makeRng(7);
    const b = makeRng(7);
    const xs = Array.from({ length: 5 }, a);
    expect(xs).toEqual(Array.from({ length: 5 }, b));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(makeRng(8)()).not.toBe(xs[0]);
  });

  it("gives the same fight for the same seed, and a different one for another", () => {
    const one = simulate(fight("mio", "azusa", 42));
    expect(simulate(fight("mio", "azusa", 42))).toEqual(one);
    expect(JSON.stringify(simulate(fight("mio", "azusa", 43)).events)).not.toBe(JSON.stringify(one.events));
  });

  it("keeps HP within its bounds and still after the KO, and every hpAfter follows from the one before", () => {
    for (const [l, r] of [["yui", "mio"], ["ritsu", "tsumugi"], ["azusa", "yui"], ["tsumugi", "mio"]] as [MemberId, MemberId][]) {
      for (let seed = 1; seed <= 30; seed++) {
        const res = simulate(fight(l, r, seed));
        const hp: Record<Side, number> = { L: res.maxHp.L, R: res.maxHp.R };
        let ended = Infinity;
        let last = -Infinity;
        for (const e of res.events) {
          expect(e.t).toBeGreaterThanOrEqual(last);
          last = e.t;
          if (e.type === "ko" || e.type === "timeUp") ended = Math.min(ended, e.t);
          if (e.type === "damage") {
            expect(e.t).toBeLessThanOrEqual(ended);
            expect(e.hpAfter).toBeCloseTo(hp[e.target] - e.amount, 9);
            hp[e.target] = e.hpAfter;
          }
          if (e.type === "heal") {
            expect(e.t).toBeLessThanOrEqual(ended);
            expect(e.hpAfter).toBeCloseTo(hp[e.target] + e.amount, 9);
            hp[e.target] = e.hpAfter;
          }
          expect(hp.L).toBeGreaterThanOrEqual(0);
          expect(hp.L).toBeLessThanOrEqual(res.maxHp.L + 1e-9);
          expect(hp.R).toBeGreaterThanOrEqual(0);
          expect(hp.R).toBeLessThanOrEqual(res.maxHp.R + 1e-9);
        }
        // nothing happens after the end
        expect(res.events.filter((e) => e.t > ended && e.type !== "status")).toEqual([]);
        expect(of(res.events, "ko").length + of(res.events, "timeUp").length).toBe(1);
        if (res.koTime !== null) expect(hp[res.winner === "L" ? "R" : "L"]).toBe(0);
      }
    }
  });

  it("doesn't let the busier part win: both strike on the same beats", () => {
    // Mio playing eighth-note sixteenths against Azusa's whole notes, and the other way round
    const uneven = (dense: MemberId, sparse: MemberId, seed: number): BattleInput => {
      const notes: SongNote[] = [];
      for (let t = 0; t < 15; t += 0.125) notes.push({ time: t, duration: 0.1, lane: dense, pitch: 48 + Math.round(t * 5) % 12, velocity: 0.7, isDownbeat: t % 0.5 === 0 });
      // and the sparse part resting through the last third
      for (let t = 0; t < 10; t += 1) notes.push({ time: t, duration: 1, lane: sparse, pitch: 60 + (t % 5), velocity: 0.7, isDownbeat: true });
      notes.sort((x, y) => x.time - y.time);
      return { ...fight("mio", "azusa", seed), notes };
    };
    const mioWins = (dense: MemberId, sparse: MemberId) =>
      Array.from({ length: 120 }, (_, k) => simulate(uneven(dense, sparse, k + 1))).filter((r) => r.winner === "L").length / 120;
    expect(Math.abs(mioWins("mio", "azusa") - mioWins("azusa", "mio"))).toBeLessThan(0.15);
  });

  it("lands the KO late, never in the clip's first 80%", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const res = simulate(fight("yui", "ritsu", seed));
      if (res.koTime !== null) expect(res.koTime).toBeGreaterThanOrEqual(0.8 * 15 - 1e-9);
    }
    // the floor: before 60% no hit goes below a quarter of her HP
    const input = fight("yui", "ritsu", 1);
    expect(earlyFloor(input, 2, 30, 10, 100)).toBe(25);
    expect(earlyFloor(input, 2, 20, 10, 100)).toBe(20);
    expect(earlyFloor(input, 10, 20, 0, 100)).toBe(3);
    expect(earlyFloor(input, 13, 20, 0, 100)).toBe(0);
  });

  it("calls TIME UP for whoever has more HP left when no one falls", () => {
    // paced to bring the other down long after the clip: nobody falls in it
    const res = simulate(fight("mio", "tsumugi", 3, { balance: { ...DEFAULT_BALANCE, koTarget: 4, driveGain: 0 } }));
    expect(res.koTime).toBeNull();
    const up = of(res.events, "timeUp")[0]!;
    expect(up.t).toBe(15 - DEFAULT_BALANCE.timeUpSeconds);
    const hp = { L: res.maxHp.L, R: res.maxHp.R };
    for (const e of res.events) if (e.type === "damage" || e.type === "heal") hp[e.target] = e.hpAfter;
    expect(up.winner).toBe(hp.L / res.maxHp.L > hp.R / res.maxHp.R ? "L" : "R");
  });

  it("only counts a member's notes her minGap apart (the rest still show)", () => {
    const input = fight("ritsu", "mio", 1, {}, 0.1);
    const counted = countedNotes(input);
    const ritsu = counted.filter((c, i) => input.notes[i]!.lane === "ritsu" && c.counted).length;
    const mio = counted.filter((c, i) => input.notes[i]!.lane === "mio" && c.counted).length;
    expect(ritsu).toBeGreaterThan(mio * 1.5);
    const res = simulate(input);
    expect(of(res.events, "noteSpawn").some((e) => !e.counted)).toBe(true);
  });

  it("paces both sides to bring the other down by the KO target", () => {
    const p = pace(fight("yui", "mio", 1));
    expect(p.damage.L).toBeGreaterThan(0);
    expect(p.progress.L(0)).toBeLessThan(0.05);
    // all of the schedule is due by the KO target (on its last beat)
    const target = DEFAULT_BALANCE.koTarget * 15;
    expect(p.progress.L(target)).toBeCloseTo(1, 9);
    expect(p.progress.L(target / 2)).toBeGreaterThan(0.3);
    expect(p.progress.L(target / 2)).toBeLessThan(0.7);
    expect(p.energy.R).toBeGreaterThan(0);
  });

  describe("passives", () => {
    it("Azusa always crits on the beat", () => {
      const res = simulate(fight("azusa", "mio", 5));
      const onBeat = of(res.events, "noteHit").filter((e) => e.side === "L" && res.input.notes[e.noteIdx]!.isDownbeat);
      expect(onBeat.length).toBeGreaterThan(5);
      expect(onBeat.every((e) => e.crit)).toBe(true);
    });

    it("Azusa grows cat ears when she's low", () => {
      const ears = Array.from({ length: 40 }, (_, k) => simulate(fight("azusa", "yui", k + 1))).some((r) =>
        of(r.events, "status").some((e) => e.side === "L" && e.effect === "catEars" && e.on),
      );
      expect(ears).toBe(true);
    });

    it("Yui daydreams now and then", () => {
      const misses = Array.from({ length: 10 }, (_, k) => simulate(fight("yui", "mio", k + 1))).flatMap((r) =>
        of(r.events, "noteMiss").filter((e) => e.side === "L" && e.reason === "daydream"),
      );
      expect(misses.length).toBeGreaterThan(0);
    });

    it("Mio takes less (the director makes up for most of it, or she'd always win)", () => {
      expect(ROSTER.mio.defense).toBeLessThan(1);
      const taken = (edge: number) => {
        let sum = 0;
        for (let seed = 1; seed <= 20; seed++) {
          const r = simulate({ ...fight("yui", "mio", seed), balance: { ...DEFAULT_BALANCE, defenseEdge: edge } });
          sum += of(r.events, "damage").filter((e) => e.target === "R" && e.t < 7).reduce((x, e) => x + e.amount, 0);
        }
        return sum;
      };
      expect(taken(1)).toBeLessThan(taken(0) * 0.9);
    });

    it("Mio panics after a big hit, and misses more", () => {
      // sparse notes: each hit is big
      const r = Array.from({ length: 30 }, (_, k) => simulate(fight("azusa", "mio", k + 1, {}, 1))).find((x) =>
        of(x.events, "status").some((e) => e.side === "R" && e.effect === "panic" && e.on),
      )!;
      const on = of(r.events, "status").find((e) => e.side === "R" && e.effect === "panic" && e.on)!;
      const hit = of(r.events, "damage").find((e) => e.target === "R" && e.t === on.t)!;
      expect(hit.amount).toBeGreaterThan(SKILLS.mioPanicOver);
      const off = of(r.events, "status").find((e) => e.side === "R" && e.effect === "panic" && !e.on && e.t > on.t);
      if (off) expect(off.t - on.t).toBeGreaterThanOrEqual(SKILLS.panicSeconds - 1e-9);
    });

    it("Ritsu fills her energy fastest", () => {
      const firstSpecial = (m: MemberId) => {
        const times = Array.from({ length: 20 }, (_, k) => simulate(fight(m, "mio", k + 1)))
          .map((r) => of(r.events, "special").find((e) => e.side === "L")?.t ?? 15);
        return times.reduce((a, b) => a + b) / times.length;
      };
      expect(firstSpecial("ritsu")).toBeLessThan(firstSpecial("yui"));
    });

    it("Mugi's heals are bigger", () => {
      const heals = (m: MemberId) => of(simulate(fight(m, "yui", 4)).events, "heal").filter((e) => e.target === "L" && e.amount > 0)[0]?.amount ?? 0;
      expect(ROSTER.tsumugi.healMult).toBeGreaterThan(1);
      expect(heals("tsumugi")).toBeGreaterThan(0);
    });
  });

  describe("specials", () => {
    const specials = (m: MemberId) =>
      Array.from({ length: 20 }, (_, k) => simulate(fight(m, m === "mio" ? "yui" : "mio", k + 1))).find((r) =>
        of(r.events, "special").some((e) => e.side === "L"),
      )!;

    it("Yui's Gitah! hits six times in under a second", () => {
      // one fired well before the end (a late one can knock out with its first hit)
      const r = Array.from({ length: 40 }, (_, k) => simulate(fight("yui", "mio", k + 1))).find((x) =>
        of(x.events, "special").some((e) => e.side === "L" && e.t < 10),
      )!;
      const at = of(r.events, "special").find((e) => e.side === "L")!.t;
      const hits = of(r.events, "damage").filter((e) => e.target === "R" && e.source === "special" && e.t >= at && e.t <= at + SKILLS.gitahSeconds + 1e-9);
      expect(hits.length).toBeGreaterThanOrEqual(SKILLS.gitahHits);
    });

    it("Mio's shield absorbs hits", () => {
      const r = specials("mio");
      expect(of(r.events, "status").some((e) => e.side === "L" && e.effect === "shield" && e.on)).toBe(true);
      expect(of(r.events, "damage").some((e) => e.target === "L" && e.absorbed > 0)).toBe(true);
    });

    it("Ritsu's storm knocks the opponent's notes away", () => {
      const r = specials("ritsu");
      expect(of(r.events, "noteMiss").some((e) => e.side === "R" && e.reason === "stunned")).toBe(true);
    });

    it("Mugi's tea time heals her", () => {
      const r = specials("tsumugi");
      const at = of(r.events, "special").find((e) => e.side === "L")!.t;
      expect(of(r.events, "heal").some((e) => e.target === "L" && e.t === at)).toBe(true);
    });

    it("Azusa's perfect beat makes her next notes crit", () => {
      const r = specials("azusa");
      const at = of(r.events, "special").find((e) => e.side === "L")!.t;
      const next = of(r.events, "noteHit").filter((e) => e.side === "L" && e.t > at).slice(0, SKILLS.perfectNotes);
      expect(next.every((e) => e.crit)).toBe(true);
    });
  });
});
