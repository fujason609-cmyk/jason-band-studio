import { LookaheadLimiter } from "./recordLimiter";

const RATE = 48000;
const db = (g: number) => 20 * Math.log10(g);

/** Run a whole signal through in 128-sample blocks, as an AudioWorklet does. */
function run(limiter: LookaheadLimiter, l: Float32Array, r = l) {
  const outL = new Float32Array(l.length);
  const outR = new Float32Array(l.length);
  for (let i = 0; i < l.length; i += 128) {
    const end = Math.min(l.length, i + 128);
    limiter.process(l.subarray(i, end), r.subarray(i, end), outL.subarray(i, end), outR.subarray(i, end));
  }
  return [outL, outR] as const;
}

describe("record limiter", () => {
  it("passes a quiet signal through untouched, only delayed by the look-ahead and raised by the gain", () => {
    const x = Float32Array.from({ length: 4800 }, (_, i) => 0.1 * Math.sin(i / 7));
    const [out] = run(new LookaheadLimiter(RATE, 6, -1.5), x);
    const delay = Math.round(0.005 * RATE) - 1;
    const gain = 10 ** (6 / 20);
    for (let i = delay; i < x.length; i += 97) expect(out[i]).toBeCloseTo(x[i - delay]! * gain, 5);
  });

  it("keeps every sample under the ceiling, linked across the channels", () => {
    // drum-like hits on a sustained chord, much too loud for +6 dB
    let seed = 1;
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const n = RATE;
    const l = Float32Array.from({ length: n }, (_, i) => 0.3 * Math.sin(i / 20) + (i % 6000 < 300 ? 0.8 * noise() : 0));
    const r = Float32Array.from({ length: n }, (_, i) => 0.3 * Math.sin(i / 23) + (i % 6000 < 300 ? 0.5 * noise() : 0));
    const limiter = new LookaheadLimiter(RATE, 6, -1.5);
    const [outL, outR] = run(limiter, l, r);
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(outL[i]!), Math.abs(outR[i]!));
    expect(db(peak)).toBeLessThanOrEqual(-1.5 + 1e-4);
    expect(limiter.maxReductionDb).toBeGreaterThan(1);
  });

  it("turns the gain down smoothly, not in a jump at the peak", () => {
    const x = new Float32Array(9600).fill(0.2);
    x[4800] = 1; // one spike
    const [out] = run(new LookaheadLimiter(RATE, 6, -1.5), x);
    // the steady part around the spike glides: no step bigger than a small fraction
    let step = 0;
    for (let i = 4700; i < 4800; i++) step = Math.max(step, Math.abs(out[i + 1]! - out[i]!));
    expect(step).toBeLessThan(0.02);
  });
});
