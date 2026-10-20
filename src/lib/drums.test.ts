import { drumSampleNote } from "./drums";

describe("drum notes to recorded kit pieces", () => {
  it("plays the canonical notes on their own piece", () => {
    for (const note of [36, 38, 42, 46, 49, 51, 43, 47, 50]) expect(drumSampleNote(note)).toBe(note);
  });

  it("sends the other General MIDI drums to the closest piece", () => {
    expect(drumSampleNote(35)).toBe(36); // acoustic bass drum → kick
    expect(drumSampleNote(40)).toBe(38); // electric snare → snare
    expect(drumSampleNote(39)).toBe(38); // clap → snare
    expect(drumSampleNote(44)).toBe(42); // pedal hi-hat → closed hat
    expect(drumSampleNote(57)).toBe(49); // crash 2 → crash
    expect(drumSampleNote(59)).toBe(51); // ride 2 → ride
    expect(drumSampleNote(41)).toBe(43); // low floor tom → floor tom
    expect(drumSampleNote(45)).toBe(47); // low tom → mid tom
    expect(drumSampleNote(48)).toBe(50); // hi-mid tom → high tom
  });
});
