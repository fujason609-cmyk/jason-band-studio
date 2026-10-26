import { createDemoProject } from "@/stores/useProjectStore";
import type { StudioProject } from "@/types/project";
import { runLab } from "./picker/lab";
import { pickFights, scoreFight } from "./picker/score";
import { battleStateAt, BOLT_SECONDS } from "./render/state";
import { routeOf } from "./route";
import { simulate } from "./sim/simulate";
import { CLIP_SECONDS, battleClip, battleInput, fighterPart } from "./sim/songInput";

const demo = createDemoProject();

describe("PK: the song into a fight", () => {
  it("fights over about 15 s of whole bars", () => {
    const clip = battleClip(demo);
    const bar = (60 / demo.baseBpm) * demo.beatsPerBar;
    expect(clip.bars).toBe(Math.round(CLIP_SECONDS / bar));
    expect(clip.start / bar).toBeCloseTo(Math.round(clip.start / bar), 9);
    expect(clip.end).toBeLessThanOrEqual(demo.durationSeconds + 1e-9);
  });

  it("starts before the chorus, so the KO lands in it", () => {
    // a song whose busy, repeated part comes late: the fight is placed around it
    const bar = (60 / demo.baseBpm) * demo.beatsPerBar;
    const tracks = demo.tracks.map((t) => ({
      ...t,
      notes: t.notes.map((n) => ({ ...n, start: n.start + 16 * bar })),
    }));
    const late: StudioProject = { ...demo, tracks, durationSeconds: demo.durationSeconds + 16 * bar };
    const clip = battleClip(late);
    expect(clip.choruses.length).toBeGreaterThan(0);
    const chorus = clip.choruses[0]!;
    expect(clip.start).toBeLessThan(chorus.start);
    expect(clip.end).toBeGreaterThan(chorus.start);
  });

  it("takes each member's own part, in real seconds at the playing tempo", () => {
    const fast = { ...demo, bpm: demo.baseBpm * 2 };
    const clip = battleClip(fast);
    const input = battleInput(fast, "mio", "azusa", 1, clip);
    expect(input.notes.every((n) => n.lane === "mio" || n.lane === "azusa")).toBe(true);
    expect(input.clip.end - input.clip.start).toBeCloseTo((clip.end - clip.start) / 2, 9);
    const first = input.notes.find((n) => n.lane === "mio")!;
    const written = demo.tracks.find((t) => t.memberId === "mio")!.notes.find((n) => n.start >= clip.start)!;
    expect(first.time).toBeCloseTo(written.start / 2, 9);
  });

  it("lets the tune stand in for a member with nothing to play there", () => {
    const silent: StudioProject = {
      ...demo,
      tracks: demo.tracks.map((t) => (t.memberId === "tsumugi" ? { ...t, notes: [] } : t)),
    };
    const part = fighterPart(silent, "tsumugi", battleClip(silent));
    expect(part.substitute).toBe("tune");
    expect(part.notes.length).toBeGreaterThan(0);
    expect(fighterPart(silent, "mio", battleClip(silent)).substitute).toBeNull();
  });
});

describe("PK picker and lab", () => {
  const input = battleInput(demo, "yui", "ritsu", 0);
  const { seed: _seed, ...unseeded } = input;
  void _seed;

  it("keeps the five best fights, best first, and can insist on a winner", () => {
    const best = pickFights(unseeded, 1, 60);
    expect(best).toHaveLength(5);
    for (let k = 1; k < best.length; k++) expect(best[k - 1]!.score.total).toBeGreaterThanOrEqual(best[k]!.score.total);
    expect(best[0]!.score.total).toBe(scoreFight(simulate({ ...unseeded, seed: best[0]!.seed })).total);
    expect(pickFights(unseeded, 1, 60, "R").every((p) => p.winner === "R")).toBe(true);
  });

  it("scores a fight from 0 to 1", () => {
    const s = scoreFight(simulate({ ...unseeded, seed: 3 }));
    for (const v of Object.values(s)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("runs every pair in the lab", () => {
    const report = runLab([demo], (s, a, b) => battleInput(s, a, b, 0), 4);
    expect(report.fights).toBe(40);
    expect(Object.keys(report.wins.yui)).toHaveLength(4);
    const ab = report.wins.yui.mio! + report.wins.mio.yui!;
    expect(ab).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("PK picture state", () => {
  const result = simulate(battleInput(demo, "mio", "azusa", 9));

  it("shows a hit's HP when its bolt lands, and the end once it comes", () => {
    const hit = result.events.find((e) => e.type === "damage" && e.amount > 0);
    if (hit?.type !== "damage") throw new Error("no hit");
    const before = battleStateAt(result, hit.t + BOLT_SECONDS / 2);
    expect(before.bolts.length).toBeGreaterThan(0);
    const after = battleStateAt(result, hit.t + BOLT_SECONDS + 0.01);
    expect(after.sides[hit.target].hp).toBeLessThanOrEqual(hit.hpAfter + 1e-9);
    expect(battleStateAt(result, result.input.clip.start).end).toBeNull();
    expect(battleStateAt(result, result.input.clip.end + 1).end).not.toBeNull();
  });

  it("reads the same at the same time, however it got there", () => {
    const t = (result.input.clip.start + result.input.clip.end) / 2;
    battleStateAt(result, t + 3);
    expect(battleStateAt(result, t)).toEqual(battleStateAt(result, t));
  });
});

describe("PK route", () => {
  it("lives behind the hash", () => {
    expect(routeOf("#/pk")).toBe("pk");
    expect(routeOf("#/pk/")).toBe("pk");
    expect(routeOf("#/pk/lab")).toBe("lab");
    expect(routeOf("")).toBeNull();
    expect(routeOf("#/pkx")).toBeNull();
  });
});
