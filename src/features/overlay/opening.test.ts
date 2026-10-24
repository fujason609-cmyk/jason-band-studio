import { HOOK_SECONDS, hookLines, openingFrame } from "./opening";
import { sparksAt, stageFrame } from "./drawStageView";

describe("a take's opening", () => {
  it("keeps the hook text to two short lines", () => {
    expect(hookLines("")).toEqual([]);
    expect(hookLines("  K-ON! plays IRIS OUT \n\n 轻音部来弹 \nthird")).toEqual(["K-ON! plays IRIS OUT", "轻音部来弹"]);
    expect(hookLines("x".repeat(80))[0]).toHaveLength(60);
  });

  it("shows the hook text first, then hangs the name over the stage", () => {
    const start = openingFrame(0.5, true, false);
    expect(start).toMatchObject({ hook: 1, card: false, stageSign: 0 });
    expect(openingFrame(HOOK_SECONDS, true, false).hook).toBeCloseTo(0);
    expect(openingFrame(HOOK_SECONDS + 1, true, false).stageSign).toBe(1);
  });

  it("without hook text, opens on the name: hung over the stage, a card that lifts away elsewhere", () => {
    expect(openingFrame(0, false, false)).toMatchObject({ hook: 0, card: true, lift: 0, stageSign: 1 });
    expect(openingFrame(2.6, false, false).lift).toBeGreaterThan(0);
    expect(openingFrame(4, false, false).card).toBe(false);
    // the skit shows the name itself
    expect(openingFrame(0, false, true).card).toBe(false);
    // a still preview: the first frame
    expect(openingFrame(null, true, false)).toMatchObject({ hook: 1, stageSign: 0 });
  });
});

describe("the stage view", () => {
  const note = (start: number, pitch = 60) => ({ pitch, start, duration: 0.3, velocity: 1 });

  it("sends up a spark for each of her recent notes, the drummer's accents only", () => {
    const notes = [note(0), note(0.5), note(0.9), note(2)];
    expect(sparksAt(notes, 1, false)).toHaveLength(2); // 0.9 and 0.5 (0 has faded)
    expect(sparksAt(notes, 1, false)[0]!.age).toBeCloseTo(0.1 / 0.9);
    const drums = [note(0.5, 42), note(0.6, 38)]; // a hi-hat, a snare
    expect(sparksAt(drums, 1, true)).toHaveLength(1);
  });

  it("stands the band above Reels' caption, and in the top half over the road", () => {
    // a 390 × 693 Reels frame without a key strip: 97 px top bar, 83 px bottom safe band
    const frame = { width: 390, height: 693, safeTop: 97, safeSide: 23, safeBottom: 83 };
    const stage = stageFrame({ ...frame, mode: "stage" });
    expect(stage.stage.frontFeet).toBeLessThanOrEqual(693 * (1 - 0.22));
    expect(stage.stage.fw).toBeGreaterThan(90); // a third of the safe width, give or take
    const split = stageFrame({ ...frame, mode: "split" });
    expect(split.stage.frontFeet).toBeLessThanOrEqual(693 / 2);
    expect(split.roadTop).toBeGreaterThan(split.stage.frontFeet);
  });
});
