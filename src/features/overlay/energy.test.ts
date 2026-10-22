import { breathAt, energyAt } from "./energy";

const note = (start: number, pitch = 60, velocity = 1) => ({ pitch, start, duration: 0.1, velocity });

describe("recording frame energy", () => {
  // 2 s bars: a quiet verse (one note a bar), then a busy chorus (eight a bar)
  const verse = [0, 2, 4, 6].map((t) => note(t));
  const chorus = Array.from({ length: 32 }, (_, i) => note(8 + i * 0.25));
  const parts = [[...verse, ...chorus]];

  it("is low in a quiet verse and full in a busy chorus", () => {
    expect(energyAt(parts, 2, 3)).toBeLessThan(0.3);
    expect(energyAt(parts, 2, 12)).toBeGreaterThan(0.9);
    expect(energyAt(parts, 2, 12)).toBeLessThanOrEqual(1);
    expect(energyAt([[]], 2, 1)).toBe(0);
  });

  it("swells on a crash and on a busy bar's downbeat kick, then settles", () => {
    const drums = [note(4, 49), note(6, 36), note(6.5, 36)]; // crash, downbeat kick, off-beat kick
    expect(breathAt(drums, 2, 4.01, 0)).toBeGreaterThan(0.9);
    expect(breathAt(drums, 2, 4.5, 0)).toBe(0); // gone after BREATH_SECONDS
    expect(breathAt(drums, 2, 6.01, 1)).toBeGreaterThan(0.4);
    expect(breathAt(drums, 2, 6.01, 0)).toBe(0); // a quiet bar's kick doesn't swell
    expect(breathAt(drums, 2, 6.51, 1)).toBeLessThan(0.1); // nor one off the downbeat (left over from 6.0)
  });
});
