import { MEMBERS } from "./members";
import { FIGURE_COLS, FIGURE_ROWS, cheerPoseAt, figureCells, memberPoseAt } from "./pixelMembers";

const note = (start: number, pitch = 60, duration = 0.5) => ({ pitch, start, duration, velocity: 0.8 });

describe("pixel members", () => {
  it("are 24 × 38 cells each, every cell a known colour, and each looks different", () => {
    const seen = new Set<string>();
    for (const { id } of MEMBERS) {
      const rows = figureCells(id);
      expect(rows, id).toHaveLength(FIGURE_ROWS);
      for (const row of rows) {
        expect(row, id).toHaveLength(FIGURE_COLS);
        expect(row.join(""), id).toMatch(/^[.dhklaseqibxonNwmgGf]+$/);
      }
      seen.add(rows.map((r) => r.join("")).join("\n"));
    }
    expect(seen.size).toBe(MEMBERS.length);
  });

  it("hop on their notes, the drummer only on kick, snare and crash", () => {
    expect(memberPoseAt("yui", [note(1)], undefined, 1.02, false).hop).toBeGreaterThan(0.8);
    expect(memberPoseAt("yui", [note(1)], undefined, 1.5, false).hop).toBe(0);
    expect(memberPoseAt("ritsu", [note(1, 42)], undefined, 1.02, true).hop).toBe(0); // hi-hat
    expect(memberPoseAt("ritsu", [note(1, 36)], undefined, 1.02, true).hop).toBeGreaterThan(0.8); // kick
  });

  it("dip on the beat while they play, and breathe while they rest", () => {
    // 120 BPM: a beat is 0.5 s; she plays a note every beat from 0 to 4 s
    const notes = Array.from({ length: 8 }, (_, i) => note(i * 0.5, 60, 0.4));
    const at = (t: number) => memberPoseAt("mio", notes, undefined, t, false, { phase: (t / 0.5) % 1, seconds: 0.5 });
    expect(at(2.05).hop).toBeGreaterThan(0);
    expect(at(2.05).bob).toBe(0); // hopping straight after a note: the hop wins
    // a long held chord: no new notes, but she still moves on every beat
    const held = [note(0, 60, 4)];
    const hold = (t: number) => memberPoseAt("mio", held, undefined, t, false, { phase: (t / 0.5) % 1, seconds: 0.5 });
    expect(hold(2.05).bob).toBe(1); // on the beat
    expect(hold(2.3).bob).toBe(0); // mid-beat
    // her last note ends at 3.9; two beats later she's resting
    const dips = [5.0, 5.05, 5.1].map((t) => at(t).bob);
    expect(dips.every((b) => b === dips[0])).toBe(true); // a held breath, not the beat
    // the same position always gives the same pose (a seek back draws the same frame)
    expect(at(3.0)).toEqual(at(3.0));
    // without a beat (no clock running), no dip at all
    expect(memberPoseAt("mio", notes, undefined, 2.0, false).bob).toBe(0);
  });

  it("cheer on the beat when they have nothing to play: a jump, the lights waving, a shout", () => {
    const at = (beats: number) => cheerPoseAt("tsumugi", beats * 0.5, { phase: beats % 1, index: Math.floor(beats), seconds: 0.5 });
    expect(at(2.1)).toMatchObject({ hop: 1, singing: true, wave: 0 }); // on the beat
    expect(at(2.5)).toMatchObject({ hop: 0, singing: false, wave: 0 }); // between beats
    expect(at(3.1)).toMatchObject({ hop: 1, singing: false, wave: 1 }); // the next beat: lights the other way
    // a pendulum sway: furthest one way on a beat, the other way on the next, upright between
    expect(at(2).sway).toBeCloseTo(1);
    expect(at(2.5).sway).toBeCloseTo(0);
    expect(at(3).sway).toBeCloseTo(-1);
    // stopped: standing, lights up
    expect(cheerPoseAt("tsumugi", 3)).toMatchObject({ hop: 0, wave: 0 });
  });

  it("sing while a sung note sounds", () => {
    expect(memberPoseAt("yui", [], [note(1, 72, 1)], 1.5, false).singing).toBe(true);
    expect(memberPoseAt("yui", [], [note(1, 72, 1)], 2.5, false).singing).toBe(false);
  });
});
