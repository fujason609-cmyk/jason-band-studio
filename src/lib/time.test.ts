import { barBeat, clampBpm, formatClock, secondsToTicks, songToRealSeconds, ticksToSeconds } from "./time";

describe("time model", () => {
  it("round-trips seconds and ticks at the base tempo", () => {
    const ticks = secondsToTicks(1.5, 120, 192);
    expect(ticks).toBe(576); // 3 beats
    expect(ticks_to(ticks)).toBeCloseTo(1.5);
    function ticks_to(t: number) {
      return ticksToSeconds(t, 120, 192);
    }
  });

  it("keeps the tick position when the tempo changes", () => {
    // A note 4 song-seconds in sits at the same tick whatever the playback BPM.
    const tick = secondsToTicks(4, 150, 192);
    expect(ticksToSeconds(tick, 150, 192)).toBeCloseTo(4);
    // At 75 BPM the same material takes twice as long in real time.
    expect(songToRealSeconds(4, 150, 75)).toBeCloseTo(8);
    expect(songToRealSeconds(4, 150, 300)).toBeCloseTo(2);
  });

  it("clamps tempo to the supported range", () => {
    expect(clampBpm(10)).toBe(40);
    expect(clampBpm(500)).toBe(240);
    expect(clampBpm(Number.NaN)).toBe(120);
    expect(clampBpm(127.6)).toBe(128);
  });

  it("formats clocks and bar positions", () => {
    expect(formatClock(0)).toBe("0:00.0");
    expect(formatClock(75.25)).toBe("1:15.2");
    expect(barBeat(0, 120, 4)).toEqual({ bar: 1, beat: 1 });
    expect(barBeat(2.5, 120, 4)).toEqual({ bar: 2, beat: 2 });
    expect(barBeat(1.5, 120, 3)).toEqual({ bar: 2, beat: 1 });
  });
});
