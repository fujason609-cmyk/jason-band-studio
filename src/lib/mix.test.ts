import { audibleMap, gainToDb, isAudible } from "./mix";

const t = (id: string, muted = false, solo = false) => ({ id, muted, solo });

describe("mute / solo rules", () => {
  it("plays every un-muted track when nothing is soloed", () => {
    const tracks = [t("a"), t("b", true), t("c")];
    expect(audibleMap(tracks)).toEqual({ a: true, b: false, c: true });
  });

  it("plays only soloed tracks once any track is soloed", () => {
    const tracks = [t("a", false, true), t("b"), t("c", false, true)];
    expect(audibleMap(tracks)).toEqual({ a: true, b: false, c: true });
  });

  it("lets mute win over solo", () => {
    const tracks = [t("a", true, true), t("b")];
    expect(isAudible(tracks[0]!, tracks)).toBe(false);
    expect(isAudible(tracks[1]!, tracks)).toBe(false);
  });

  it("restores the original mute state when solos are cleared", () => {
    const soloed = [t("a", false, true), t("b", true), t("c")];
    const cleared = soloed.map((x) => ({ ...x, solo: false }));
    expect(audibleMap(cleared)).toEqual({ a: true, b: false, c: true });
  });
});

describe("gainToDb", () => {
  it("maps unity to 0 dB and zero to silence", () => {
    expect(gainToDb(1)).toBe(0);
    expect(gainToDb(0)).toBe(-Infinity);
    expect(gainToDb(0.5)).toBeCloseTo(-6.02, 1);
  });
});
