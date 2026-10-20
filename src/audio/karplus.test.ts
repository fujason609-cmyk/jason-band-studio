import { pluckPitches, renderPluck } from "./karplus";

const SR = 48000;

/** Fundamental from autocorrelation: the lag with the strongest match in a plausible range. */
function estimatePitch(x: Float32Array, from: number, expected: number): number {
  const win = 4096;
  const minLag = Math.floor(SR / (expected * 1.5));
  const maxLag = Math.ceil(SR / (expected / 1.5));
  let best = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = from; i < from + win; i++) s += x[i]! * x[i + lag]!;
    if (s > bestScore) {
      bestScore = s;
      best = lag;
    }
  }
  // refine between samples with a parabola through the peak
  const score = (lag: number) => {
    let s = 0;
    for (let i = from; i < from + win; i++) s += x[i]! * x[i + lag]!;
    return s;
  };
  const a = score(best - 1);
  const b = score(best);
  const c = score(best + 1);
  const shift = (a - c) / (2 * (a - 2 * b + c));
  return SR / (best + shift);
}

const rms = (x: Float32Array, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / (to - from));
};

// a fixed noise sequence so the test is repeatable
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("Karplus–Strong pluck", () => {
  const patch = { t60: 2, brightness: 0.6, seconds: 1.5 };

  it.each([82.41, 110, 329.63, 659.25, 1318.5])("is in tune at %f Hz (within 10 cents)", (hz) => {
    const x = renderPluck(hz, SR, patch, seeded(7));
    const found = estimatePitch(x, 2000, hz);
    const cents = 1200 * Math.log2(found / hz);
    expect(Math.abs(cents)).toBeLessThan(10);
  });

  it("decays, stays inside full scale and starts and ends silently", () => {
    const x = renderPluck(196, SR, patch, seeded(3));
    expect(rms(x, SR * 1, SR * 1.4)).toBeLessThan(rms(x, 1000, SR * 0.2) / 4);
    expect(Math.max(...Array.from(x, Math.abs))).toBeLessThanOrEqual(0.9001);
    expect(Math.abs(x[0]!)).toBeLessThan(1e-6);
    expect(Math.abs(x[x.length - 1]!)).toBeLessThan(1e-3);
  });

  it("is brighter with a brighter pick", () => {
    // high-frequency energy: mean absolute first difference, relative to level
    const edge = (b: number) => {
      const x = renderPluck(110, SR, { ...patch, brightness: b }, seeded(11));
      let d = 0;
      for (let i = 1; i < 6000; i++) d += Math.abs(x[i]! - x[i - 1]!);
      return d / rms(x, 0, 6000);
    };
    expect(edge(0.9)).toBeGreaterThan(edge(0.1));
  });

  it("covers a range with evenly spaced samples, top included", () => {
    expect(pluckPitches(40, 50, 3)).toEqual([40, 43, 46, 49, 50]);
  });
});
