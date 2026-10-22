import { burstKind, laneActivity, noteState, summarise } from "./drawTimeline";

describe("note state against the playhead", () => {
  const note = { pitch: 60, start: 2, duration: 1, velocity: 0.8 };

  it("is upcoming before it starts, active while it sounds, past after", () => {
    expect(noteState(note, 1.99, false)).toBe("upcoming");
    expect(noteState(note, 2, false)).toBe("active");
    expect(noteState(note, 2.9, false)).toBe("active");
    expect(noteState(note, 3, false)).toBe("past");
  });

  it("treats a drum hit as a short flash, whatever its stored length", () => {
    expect(noteState(note, 2.1, true)).toBe("active");
    expect(noteState(note, 2.5, true)).toBe("past");
  });
});

describe("part summary", () => {
  it("is worked out once per notes array and knows the longest note", () => {
    const notes = [
      { pitch: 48, start: 0, duration: 12, velocity: 0.8 }, // a 12 s pad: still on screen at 9 s
      { pitch: 72, start: 1, duration: 0.5, velocity: 0.8 },
    ];
    const s = summarise(notes);
    expect(s).toEqual({ lo: 48, hi: 72, longest: 12 });
    expect(summarise(notes)).toBe(s); // cached: no rescan on the next frame
  });
});

describe("lane activity", () => {
  const part = [{ pitch: 60, start: 1, duration: 1, velocity: 0.8 }];

  it("is full while a note sounds and fades out after it", () => {
    expect(laneActivity(part, 0.5, false)).toBe(0);
    expect(laneActivity(part, 1.5, false)).toBe(1);
    expect(laneActivity(part, 2.4, false)).toBeCloseTo(0.5);
    expect(laneActivity(part, 3, false)).toBe(0);
  });

  it("counts a drum hit only for a moment", () => {
    expect(laneActivity(part, 1.1, true)).toBe(1);
    expect(laneActivity(part, 1.95, true)).toBe(0);
  });
});

describe("hit bursts", () => {
  it("differ by instrument: stars for guitars and snare, a ring for bass and kick, bubbles for keys", () => {
    expect(burstKind("lead-guitar")).toBe("stars");
    expect(burstKind("bass")).toBe("ring");
    expect(burstKind("keys")).toBe("bubbles");
    expect(burstKind("drums", "kick")).toBe("ring");
    expect(burstKind("drums", "snare")).toBe("stars");
  });
});
