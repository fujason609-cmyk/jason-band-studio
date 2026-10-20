import { noteState } from "./drawTimeline";

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
