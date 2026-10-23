import type { NoteEvent } from "@/types/midi";
import type { StudioProject } from "@/types/project";
import {
  GOOD_SEAM,
  clipLengths,
  findChorus,
  findHighlight,
  loopNotes,
  rankHighlights,
} from "./highlight";

// 120 BPM in 4/4: a bar is 2 s, so a 15–20 s clip is 8 to 10 bars
const BAR = 2;
const note = (start: number, pitch = 60, duration = 0.2): NoteEvent => ({
  pitch,
  start,
  duration,
  velocity: 0.8,
});

/** One guitar part, `k` notes of `pitch` in each bar, plus a crash on the downbeat of bars in `crashes`. */
function song(bars: (number | [number, number])[], crashes: number[] = []): StudioProject {
  const guitar = bars.flatMap((spec, b) => {
    const [k, pitch] = typeof spec === "number" ? [spec, 60] : spec;
    return Array.from({ length: k }, (_, i) => note(b * BAR + (i * BAR) / k, pitch));
  });
  const drums = crashes.map((b) => note(b * BAR, 49));
  return {
    baseBpm: 120,
    bpm: 120,
    beatsPerBar: 4,
    durationSeconds: bars.length * BAR,
    tracks: [
      { instrument: "lead-guitar", notes: guitar },
      { instrument: "drums", notes: drums },
    ],
  } as unknown as StudioProject;
}

describe("highlight clip", () => {
  it("is any whole number of bars from 15 to 20 s", () => {
    expect(clipLengths(2)).toEqual([8, 9, 10]); // 16, 18, 20 s
    expect(clipLengths(4 / 3)).toEqual([12, 13, 14, 15]); // 180 BPM: 16 to 20 s
    expect(clipLengths(25)).toEqual([1]); // a very long bar: the nearest there is
  });

  it("starts on the busiest stretch, where the chorus comes in", () => {
    // verse, chorus, verse, chorus: the chorus comes in after a quiet bar both times
    const verse = Array(8).fill([4, 55]);
    const chorus = Array.from({ length: 10 }, (_, i): [number, number] => [16, 60 + i]); // a tune: no two bars alike
    const h = findHighlight(song([...verse, ...chorus, ...verse, ...chorus, ...verse], [8, 26]))!;
    expect([8, 26]).toContain(h.firstBar);
    expect(h.bars).toBeGreaterThanOrEqual(8); // 16–20 s, inside the chorus
    expect(h.bars).toBeLessThanOrEqual(10);
    expect(h.start).toBe(h.firstBar * BAR);
  });

  it("stretches past 20 s only when nothing in 15–20 s loops well", () => {
    // a song that repeats every 6 bars (12 s): 8–10 bars can't loop, 12 bars (24 s) is too
    // long, but 7 bars (14 s) still can't either; 11 bars (22 s) is in the stretch, still not a period
    const cycle = (b: number): [number, number] => [12, 55 + (b % 6) * 2];
    const ranked = rankHighlights(song(Array.from({ length: 48 }, (_, b) => cycle(b))));
    for (const c of ranked) expect(c.end - c.start).toBeLessThanOrEqual(22);
    // a song repeating every 2 bars loops fine in range: no stretching
    const riff = rankHighlights(
      song(Array.from({ length: 32 }, (_, b): [number, number] => [12, b % 2 ? 67 : 60])),
    );
    expect(riff[0]!.seam).toBeGreaterThanOrEqual(GOOD_SEAM);
    expect(riff[0]!.end - riff[0]!.start).toBeGreaterThanOrEqual(15);
    expect(riff[0]!.end - riff[0]!.start).toBeLessThanOrEqual(20);
  });

  it("ends where the music would run back into its start", () => {
    // a two-bar riff, A B A B …: an odd number of bars would end on A and loop into A again
    const riff = Array.from({ length: 32 }, (_, b): [number, number] => [12, b % 2 ? 67 : 60]);
    const h = findHighlight(song(riff))!;
    expect(h.bars % 2).toBe(0);
  });

  it("ignores the solo round after the song", () => {
    const h = findHighlight(song([...Array(16).fill(4), ...Array(10).fill(30)]), 16 * BAR)!;
    expect(h.end).toBeLessThanOrEqual(16 * BAR);
  });

  it("is null for a song shorter than the clip", () => {
    expect(findHighlight(song([4, 4, 4]))).toBeNull();
  });

  it("tiles the clip's notes a loop before and after, so the last frame is the first again", () => {
    const h = { start: 4, end: 8, firstBar: 2, bars: 2, repeats: 1 };
    const notes = [note(3), note(4), note(7.5), note(8)];
    const looped = loopNotes(notes, h);
    expect(looped.map((n) => n.start)).toEqual([0, 3.5, 4, 7.5, 8, 11.5]);
    expect(loopNotes(notes, h)).toBe(looped); // memoised: the same array every frame
  });
});

describe("chorus", () => {
  // verse (quiet, its own tune), chorus (busy, 12 bars of its own tune), verse, chorus, a
  // bridge that never comes back, the last chorus
  const verse = Array.from({ length: 8 }, (_, i): [number, number] => [4, 48 + (i % 4)]);
  const chorus = Array.from({ length: 12 }, (_, i): [number, number] => [12, 60 + (i % 6) * 2]);
  const bridge = Array.from({ length: 8 }, (_, i): [number, number] => [6, 70 - i]);
  const bars = [...verse, ...chorus, ...verse, ...chorus, ...bridge, ...chorus, ...verse];

  it("is a whole chorus, however long, where the song plays it again", () => {
    const c = findChorus(song(bars, [8, 28, 48]))!;
    expect([8, 28, 48]).toContain(c.firstBar);
    expect(c.bars).toBe(12);
    expect(c.repeats).toBe(1);
  });

  it("prefers the last chorus when they're all alike", () => {
    expect(findChorus(song(bars, [8, 28, 48]))!.firstBar).toBe(48);
  });

  it("still finds the big section when nothing comes back (a TV-size cut)", () => {
    // every bar its own pitch: quiet for 12 bars, then busy for 12
    const once = Array.from({ length: 24 }, (_, i): [number, number] => [i < 12 ? 2 : 12, 40 + i]);
    const c = findChorus(song(once))!;
    expect(c.firstBar).toBeGreaterThanOrEqual(10);
  });

  it("is null for a song shorter than a chorus", () => {
    expect(findChorus(song(chorus.slice(0, 6)))).toBeNull();
  });

  it("runs on to finish a sung line that crosses its last bar line, and lets it ring", () => {
    const p = song(bars, [8, 28, 48]);
    // each chorus sung through, its last word held into the bar after it, then a breath
    const sung = [8, 28, 48].flatMap((from) => [
      ...Array.from({ length: 12 }, (_, i) => note((from + i) * BAR, 72, BAR - 0.1)),
      note((from + 12) * BAR, 74, 1.5),
    ]);
    const withVocal = { ...p, tracks: [...p.tracks, { instrument: "lead-guitar", notes: [], vocal: sung }] };
    const c = findChorus(withVocal as unknown as StudioProject)!;
    expect(c.bars).toBe(13);
    expect(c.end).toBe(c.start + 13 * BAR);
    expect(c.ring).toBeGreaterThan(0);
    // without the singer, the chorus ends on its own bar line
    expect(findChorus(p)!.bars).toBe(12);
  });
});
