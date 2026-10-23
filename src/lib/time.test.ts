import { barBeat, beatPhase, clampBpm, formatClock, secondsToTicks, songToRealSeconds, ticksToSeconds } from "./time";

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
    expect(clampBpm(500)).toBe(300);
    expect(clampBpm(Number.NaN)).toBe(120);
    expect(clampBpm(133.333)).toBe(133.33); // an imported tempo keeps its decimals
  });

  it("formats clocks and bar positions", () => {
    expect(formatClock(0)).toBe("0:00.0");
    expect(formatClock(75.25)).toBe("1:15.2");
    expect(barBeat(0, 120, 4)).toEqual({ bar: 1, beat: 1 });
    expect(barBeat(2.5, 120, 4)).toEqual({ bar: 2, beat: 2 });
    expect(barBeat(1.5, 120, 3)).toEqual({ bar: 2, beat: 1 });
  });
  it("finds the beat by the song's own tempo map", () => {
    expect(beatPhase(0.25, undefined, 120)).toBeCloseTo(0.5); // 0.5 s beats
    // 120 BPM for 2 s (4 beats), then 60 BPM: at 2.5 s, half a 1 s beat in
    const tempos = [{ ticks: 0, bpm: 120, time: 0 }, { ticks: 1920, bpm: 60, time: 2 }];
    expect(beatPhase(2.5, tempos, 120)).toBeCloseTo(0.5);
    expect(beatPhase(3.0, tempos, 120)).toBeCloseTo(0);
    // without the map, the first tempo carries on and the beats drift
    expect(beatPhase(2.5, undefined, 120)).toBeCloseTo(0);
    // broken stored entries are skipped
    expect(beatPhase(0.25, [{ ticks: 0, bpm: NaN, time: 0 }] as never, 120)).toBeCloseTo(0.5);
  });
});
