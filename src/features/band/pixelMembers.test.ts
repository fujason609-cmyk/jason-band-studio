import { MEMBERS } from "./members";
import { FIGURE_COLS, FIGURE_ROWS, figureCells, memberPoseAt } from "./pixelMembers";

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

  it("sing while a sung note sounds", () => {
    expect(memberPoseAt("yui", [], [note(1, 72, 1)], 1.5, false).singing).toBe(true);
    expect(memberPoseAt("yui", [], [note(1, 72, 1)], 2.5, false).singing).toBe(false);
  });
});
