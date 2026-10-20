import { MUGI_PIANO, renderFmPiano } from "./fmPiano";

const SR = 48000;

/** Period from autocorrelation, refined with a parabola, as a frequency. */
function estimatePitch(x: Float32Array, from: number, expected: number): number {
  const win = 4096;
  const score = (lag: number) => {
    let s = 0;
    for (let i = from; i < from + win; i++) s += x[i]! * x[i + lag]!;
    return s;
  };
  let best = 0;
  let bestScore = -Infinity;
  for (let lag = Math.floor(SR / (expected * 1.5)); lag <= Math.ceil(SR / (expected / 1.5)); lag++) {
    const s = score(lag);
    if (s > bestScore) {
      bestScore = s;
      best = lag;
    }
  }
  const [a, b, c] = [score(best - 1), score(best), score(best + 1)];
  return SR / (best + (a - c) / (2 * (a - 2 * b + c)));
}

const rms = (x: Float32Array, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / (to - from));
};

describe("FM piano note", () => {
  it.each([110, 261.63, 880])("sounds at its pitch (%f Hz, within 5 cents)", (hz) => {
    const x = renderFmPiano(hz, SR, MUGI_PIANO);
    const cents = 1200 * Math.log2(estimatePitch(x, 4000, hz) / hz);
    expect(Math.abs(cents)).toBeLessThan(5);
  });

  it("strikes, decays towards its sustain, and stays inside full scale without clicks", () => {
    const x = renderFmPiano(261.63, SR, MUGI_PIANO);
    expect(x.length).toBe(MUGI_PIANO.seconds * SR);
    expect(rms(x, SR * 2, SR * 2.5)).toBeLessThan(rms(x, 0, SR * 0.2) / 2);
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThanOrEqual(0.9001);
    expect(Math.abs(x[0]!)).toBeLessThan(1e-6);
    expect(Math.abs(x[x.length - 1]!)).toBeLessThan(1e-3);
  });
});
