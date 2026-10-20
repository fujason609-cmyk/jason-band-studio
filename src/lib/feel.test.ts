import { FEEL_PROFILES, humanize, profileFor, strumOffsets } from "./feel";

const PPQ = 192;
const mid = () => 0.5; // random() at the centre: no jitter
const note = (ticks: number, velocity = 0.7) => ({ ticks, velocity, strumIndex: 0 });

describe("member feel", () => {
  it("has Ritsu push ahead of the beat and hit downbeats hard", () => {
    const ritsu = profileFor("ritsu", "character");
    const onOne = humanize(ritsu, note(0), PPQ, mid);
    const offBeat = humanize(ritsu, note(PPQ), PPQ, mid);
    expect(onOne.offset).toBeLessThan(0);
    expect(onOne.velocity).toBeGreaterThan(offBeat.velocity);
  });

  it("keeps Mio steadier than Yui", () => {
    expect(FEEL_PROFILES.mio.jitterSeconds).toBeLessThan(FEEL_PROFILES.yui.jitterSeconds);
    expect(FEEL_PROFILES.mio.velocitySpread).toBeLessThan(FEEL_PROFILES.yui.velocitySpread);
  });

  it("stays within its spread, even at the extremes of random()", () => {
    const yui = profileFor("yui", "character");
    for (const r of [0, 1]) {
      const { offset, velocity } = humanize(yui, note(PPQ), PPQ, () => r);
      expect(Math.abs(offset - yui.pushSeconds)).toBeLessThanOrEqual(yui.jitterSeconds + 1e-9);
      expect(velocity).toBeGreaterThanOrEqual(0.05);
      expect(velocity).toBeLessThanOrEqual(1);
    }
  });

  it("plays exactly on the grid when set to steady, but still strums chords", () => {
    const steady = profileFor("ritsu", "steady");
    expect(humanize(steady, note(0), PPQ, () => 1)).toEqual({ offset: 0, velocity: 0.7 });
    const azusa = profileFor("azusa", "steady");
    expect(humanize(azusa, { ticks: 0, velocity: 0.7, strumIndex: 3 }, PPQ, mid).offset).toBeCloseTo(3 * azusa.strumSeconds);
  });
});

describe("strums", () => {
  it("rolls a chord on the beat from the lowest string up", () => {
    const chord = [64, 48, 55].map((pitch) => ({ ticks: 0, pitch }));
    expect(strumOffsets(chord, PPQ)).toEqual([2, 0, 1]);
  });

  it("strums the off-beat eighth upwards, high string first", () => {
    const chord = [64, 48, 55].map((pitch) => ({ ticks: PPQ / 2, pitch }));
    expect(strumOffsets(chord, PPQ)).toEqual([0, 2, 1]);
  });

  it("leaves single notes alone", () => {
    expect(strumOffsets([{ ticks: 0, pitch: 60 }, { ticks: 96, pitch: 62 }], PPQ)).toEqual([0, 0]);
  });
});
