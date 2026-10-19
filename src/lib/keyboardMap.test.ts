import { isBlackKey, isTypingTarget, keyToPitch, pitchName, pitchToKeyLabel } from "./keyboardMap";
import { drumVoiceFor } from "./drums";

describe("computer keyboard mapping", () => {
  it("maps the home row to white keys from C", () => {
    expect(keyToPitch("a", 4)).toBe(60);
    expect(keyToPitch("s", 4)).toBe(62);
    expect(keyToPitch("k", 4)).toBe(72);
    expect(keyToPitch("A", 4)).toBe(60);
  });

  it("maps the top row to sharps", () => {
    expect(keyToPitch("w", 4)).toBe(61);
    expect(keyToPitch("t", 3)).toBe(54);
    expect(isBlackKey(61)).toBe(true);
  });

  it("ignores unmapped keys", () => {
    expect(keyToPitch("q", 4)).toBeNull();
    expect(keyToPitch("1", 4)).toBeNull();
  });

  it("labels keys and pitches", () => {
    expect(pitchToKeyLabel(60, 4)).toBe("A");
    expect(pitchToKeyLabel(61, 4)).toBe("W");
    expect(pitchToKeyLabel(48, 4)).toBeNull();
    expect(pitchName(60)).toBe("C4");
    expect(pitchName(70)).toBe("A♯4");
  });

  it("does not hijack typing in text fields", () => {
    const input = document.createElement("input");
    expect(isTypingTarget(input)).toBe(true);
    const range = document.createElement("input");
    range.type = "range";
    expect(isTypingTarget(range)).toBe(false);
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
  });

  it("sorts General MIDI drums into voices", () => {
    expect(drumVoiceFor(36)).toBe("kick");
    expect(drumVoiceFor(38)).toBe("snare");
    expect(drumVoiceFor(42)).toBe("closed-hat");
    expect(drumVoiceFor(49)).toBe("crash");
    expect(drumVoiceFor(45)).toBe("tom");
  });
});
