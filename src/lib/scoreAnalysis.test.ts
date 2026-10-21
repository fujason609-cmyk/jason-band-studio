import type { NoteEvent } from "@/types/midi";
import { barChords, commonProgression, signatureFigure, signatureGroove } from "./scoreAnalysis";

// 120 BPM in 4/4: a beat is 0.5 s, a bar 2 s
const grid = { beat: 0.5, beatsPerBar: 4 };
const n = (pitch: number, beat: number, beats = 1, velocity = 0.8): NoteEvent => ({ pitch, start: beat * 0.5, duration: beats * 0.5, velocity });
/** A triad held for bar `bar`, with its root in the bass. */
const chordBar = (bar: number, root: number, minor = false) => [
  n(root - 12, bar * 4, 4),
  n(root, bar * 4, 4),
  n(root + (minor ? 3 : 4), bar * 4, 4),
  n(root + 7, bar * 4, 4),
];

describe("reading a score", () => {
  it("names the chord of each bar", () => {
    const notes = [...chordBar(0, 60), ...chordBar(1, 67), ...chordBar(2, 69, true), ...chordBar(3, 65)];
    expect(barChords([notes], grid, 5)).toEqual([
      { root: 0, minor: false },
      { root: 7, minor: false },
      { root: 9, minor: true },
      { root: 5, minor: false },
      null,
    ]);
  });

  it("finds the progression the song repeats most", () => {
    const C = { root: 0, minor: false };
    const G = { root: 7, minor: false };
    const Am = { root: 9, minor: true };
    const F = { root: 5, minor: false };
    const D = { root: 2, minor: false };
    // verse D D G G, then the chorus C G Am F twice
    const song = [D, D, G, G, C, G, Am, F, C, G, Am, F];
    expect(commonProgression(song)).toEqual([C, G, Am, F]);
    expect(commonProgression([C, C, C, C])).toBeNull(); // one chord isn't a progression
    expect(commonProgression([C, null, G, Am, F])).toBeNull();
  });

  it("picks a part's most played bar, wherever it sits", () => {
    const riff = (bar: number, root: number) => [n(root, bar * 4, 0.5), n(root + 3, bar * 4 + 0.5, 0.5), n(root + 5, bar * 4 + 1, 1), n(root + 3, bar * 4 + 2.5, 1)];
    // the riff three times on different chords, and one bar of something else
    const part = [...riff(0, 52), ...[n(60, 4), n(62, 5), n(64, 6)], ...riff(2, 55), ...riff(3, 57)];
    const figure = signatureFigure(part, grid, [])!;
    expect(figure.bar).toBe(0);
    expect(figure.notes.map((x) => [x.beat, x.pitch])).toEqual([
      [0, 52],
      [0.5, 55],
      [1, 57],
      [2.5, 55],
    ]);
    expect(signatureFigure([n(60, 0)], grid, [])).toBeNull(); // nothing worth calling a figure
  });

  it("picks the drum part's most played bar", () => {
    const groove = (bar: number) => [n(36, bar * 4), n(42, bar * 4), n(38, bar * 4 + 1), n(42, bar * 4 + 1), n(36, bar * 4 + 2.5), n(38, bar * 4 + 3)];
    const kit = [...groove(0), ...groove(1), n(49, 8), n(36, 8), n(38, 9), n(38, 9.5), ...groove(3)];
    expect(signatureGroove(kit, grid)!.map((h) => [h.beat, h.pitch])).toEqual([
      [0, 36],
      [0, 42],
      [1, 38],
      [1, 42],
      [2.5, 36],
      [3, 38],
    ]);
  });
});
