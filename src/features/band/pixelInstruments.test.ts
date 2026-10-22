import type { InstrumentId } from "@/types/audio";
import { IDLE_POSE, bodyShades, gearFor, pixelGrid, poseAt, poseKey, spriteCells } from "./pixelInstruments";

const INSTRUMENTS: InstrumentId[] = ["lead-guitar", "rhythm-guitar", "bass", "drums", "keys"];
const note = (start: number, pitch = 60, duration = 0.5) => ({ pitch, start, duration, velocity: 0.8 });

describe("pixel instruments", () => {
  it("stay inside their 16 × 16 grid and use only known colours", () => {
    for (const instrument of INSTRUMENTS) {
      for (const pose of [IDLE_POSE, { frame: "hit" as const, amount: 1, keys: [] }, { frame: "crash" as const, amount: 1, keys: [3] }]) {
        const cells = spriteCells(instrument, pose);
        expect(cells.length).toBeGreaterThan(20);
        for (const [x, y, c] of cells) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(16);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThan(16);
          expect("mdwnskp").toContain(c);
        }
      }
    }
  });

  it("look different while playing", () => {
    const hit = { frame: "hit" as const, amount: 1, keys: [] };
    for (const instrument of ["lead-guitar", "bass", "drums"] as InstrumentId[]) {
      expect(spriteCells(instrument, hit)).not.toEqual(spriteCells(instrument, IDLE_POSE));
    }
    expect(spriteCells("drums", { frame: "crash", amount: 1, keys: [] })).not.toEqual(spriteCells("drums", hit));
    expect(spriteCells("keys", { frame: "idle", amount: 0, keys: [5] })).not.toEqual(spriteCells("keys", IDLE_POSE));
  });

  it("shade a sunburst from the body's edge inwards, only on the member's own instrument", () => {
    const depth = bodyShades(spriteCells("lead-guitar", IDLE_POSE));
    const values = [...depth.values()];
    expect(Math.min(...values)).toBe(1);
    expect(Math.max(...values)).toBeGreaterThanOrEqual(3); // edge, middle and centre all show
    expect(gearFor("yui", "lead-guitar")).toBeDefined();
    expect(gearFor("yui", "bass")).toBeUndefined(); // on another instrument: her colour instead
    expect(gearFor("mio", "bass")?.centre).not.toBe(gearFor("mio", "bass")?.edge);
  });

  it("strum right after a note starts, then rest", () => {
    const notes = [note(1), note(3)];
    expect(poseAt(notes, 1.02, "lead-guitar").frame).toBe("hit");
    expect(poseAt(notes, 1.5, "lead-guitar")).toBe(IDLE_POSE);
    expect(poseAt(notes, 0.5, "lead-guitar")).toBe(IDLE_POSE);
    expect(poseAt([], 1, "bass")).toBe(IDLE_POSE);
  });

  it("rock the cymbal on a crash and hold down the keys being played", () => {
    expect(poseAt([note(2, 38)], 2.01, "drums").frame).toBe("hit");
    expect(poseAt([note(2, 49)], 2.01, "drums").frame).toBe("crash");
    const held = poseAt([note(0, 60, 4), note(0, 67, 4)], 2, "keys");
    expect(held.frame).toBe("idle"); // no fresh hit
    expect(held.keys).toHaveLength(2); // but two keys down
    expect(poseKey(held)).not.toBe(poseKey(IDLE_POSE));
  });
});

describe("pixel grid", () => {
  it("rounds to whole device pixels under a scaled, shifted canvas", () => {
    const ctx = { getTransform: () => ({ a: 2.77, d: 2.77, e: 23.4 * 2.77, f: 0 }) } as unknown as CanvasRenderingContext2D;
    const grid = pixelGrid(ctx);
    const whole = (n: number) => Math.abs(n - Math.round(n));
    for (const v of [0.1, 5.33, 17.9]) {
      expect(whole(grid.x(v) * 2.77 + 23.4 * 2.77)).toBeLessThan(1e-9);
      expect(Math.abs(grid.x(v) - v)).toBeLessThanOrEqual(0.5 / 2.77 + 1e-9);
      expect(whole(grid.y(v) * 2.77)).toBeLessThan(1e-9);
    }
  });
});
