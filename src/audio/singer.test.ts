import { BREATH_LEAD, breathTimes, fitToVoice } from "@/features/band/vocals";
import { MIO_VOICE, YUI_VOICE, renderBreath, renderSungNote } from "./singer";

const SR = 48000;

/** Period from autocorrelation over a window, refined with a parabola, as a frequency. */
function pitchAt(x: Float32Array, from: number, expected: number, win = 2048): number {
  const score = (lag: number) => {
    let s = 0;
    for (let i = from; i < from + win; i++) s += x[i]! * x[i + lag]!;
    return s;
  };
  let best = 0;
  let bestScore = -Infinity;
  for (let lag = Math.floor(SR / (expected * 1.3)); lag <= Math.ceil(SR / (expected / 1.3)); lag++) {
    const s = score(lag);
    if (s > bestScore) {
      bestScore = s;
      best = lag;
    }
  }
  const [a, b, c] = [score(best - 1), score(best), score(best + 1)];
  return SR / (best + (a - c) / (2 * (a - 2 * b + c)));
}

const cents = (f: number, ref: number) => 1200 * Math.log2(f / ref);

/** Share of the energy above 2 kHz, from first differences (a rough brightness measure). */
function brightness(x: Float32Array): number {
  let all = 0;
  let edge = 0;
  for (let i = 1; i < x.length; i++) {
    all += x[i]! * x[i]!;
    const d = x[i]! - x[i - 1]!;
    edge += d * d;
  }
  return edge / all;
}

describe("sung notes", () => {
  it.each([
    ["Yui", YUI_VOICE, 440],
    ["Yui", YUI_VOICE, 659.26],
    ["Mio", MIO_VOICE, 329.63],
  ] as const)("%s sings at the pitch she's given (%s Hz) before the vibrato starts", (_who, voice, hz) => {
    const x = renderSungNote(hz, SR, voice);
    // after the scoop, before the vibrato: within 12 cents
    expect(Math.abs(cents(pitchAt(x, Math.round(SR * 0.09), hz), hz))).toBeLessThan(12);
  });

  it("starts straight, then the vibrato grows in", () => {
    const x = renderSungNote(440, SR, YUI_VOICE);
    const spread = (from: number, to: number) => {
      const p: number[] = [];
      for (let t = from; t < to; t += 0.02) p.push(cents(pitchAt(x, Math.round(SR * t), 440, 1024), 440));
      return Math.max(...p) - Math.min(...p);
    };
    expect(spread(0.08, 0.2)).toBeLessThan(15);
    expect(spread(1, 1.6)).toBeGreaterThan(30); // about ±28 cents once it has grown in
  });

  it("gives Yui a brighter voice than Mio", () => {
    expect(brightness(renderSungNote(440, SR, YUI_VOICE))).toBeGreaterThan(brightness(renderSungNote(440, SR, MIO_VOICE)) * 1.3);
  });

  it("stays inside full scale, starts and ends without a click, and renders the same every time", () => {
    const x = renderSungNote(523.25, SR, MIO_VOICE);
    expect(x.length).toBe(MIO_VOICE.seconds * SR);
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v)); // NaN would make this NaN
    expect(peak).toBeGreaterThan(0.89);
    expect(peak).toBeLessThanOrEqual(0.9001);
    expect(Math.abs(x[0]!)).toBeLessThan(1e-6);
    expect(Math.abs(x[x.length - 1]!)).toBeLessThan(1e-3);
    const again = renderSungNote(523.25, SR, MIO_VOICE);
    expect(again.every((v, i) => v === x[i])).toBe(true);
  });
});

describe("fitting a part to a girl's voice", () => {
  const n = (pitch: number) => ({ pitch, start: 0, duration: 1, velocity: 1 });

  it("moves a part that sits too low up by whole octaves, keeping its shape", () => {
    const men = [n(48), n(50), n(52), n(55)]; // a men's choir line, C3 to G3
    expect(fitToVoice(men, "lead").map((x) => x.pitch)).toEqual([72, 74, 76, 79]); // around B4, where a girl sings a lead
    const bassLine = [n(36), n(38), n(40), n(43)];
    expect(fitToVoice(bassLine, "harmony").map((x) => x.pitch)).toEqual([60, 62, 64, 67]);
  });

  it("leaves a part already in range alone", () => {
    const tune = [n(64), n(67), n(69), n(72)];
    expect(fitToVoice(tune, "lead")).toBe(tune);
  });
});

describe("breathing", () => {
  const n = (start: number, duration: number) => ({ start, duration });

  it("breathes in before the first note and after every rest, never inside a phrase", () => {
    const phrase = [n(1, 0.5), n(1.5, 0.5), n(2, 1), n(3.6, 0.5), n(4.1, 0.4)];
    const times = breathTimes(phrase);
    expect(times).toHaveLength(2);
    expect(times[0]).toBeCloseTo(1 - BREATH_LEAD);
    expect(times[1]).toBeCloseTo(3.6 - BREATH_LEAD); // after the 0.6 s rest
    // a rest just long enough: the breath fills it, after the last note has ended
    expect(breathTimes([n(0.5, 1), n(1.9, 1)])[1]).toBeCloseTo(1.9 - BREATH_LEAD);
    expect(breathTimes([n(0.5, 1), n(1.8, 1)])).toHaveLength(1); // 0.3 s is too short to breathe
    expect(breathTimes([n(0, 1)])).toEqual([0]);
  });

  it("is an airy rush with no pitch, swelling and fading out", () => {
    const x = renderBreath(SR, YUI_VOICE);
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.89);
    expect(peak).toBeLessThanOrEqual(0.9001);
    expect(Math.abs(x[0]!)).toBeLessThan(0.01);
    expect(Math.abs(x[x.length - 1]!)).toBeLessThan(0.05);
    // mostly high frequencies: big sample-to-sample changes, no low rumble
    let all = 0;
    let edge = 0;
    for (let i = 1; i < x.length; i++) {
      all += x[i]! * x[i]!;
      edge += (x[i]! - x[i - 1]!) ** 2;
    }
    expect(edge / all).toBeGreaterThan(0.2);
  });
});
