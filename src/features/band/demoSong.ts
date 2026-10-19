import type { MemberId } from "./types";
import type { NoteEvent } from "@/types/midi";

/**
 * "After School Jam" — an original 16-bar practice tune written for this project
 * so the studio has something to play out of the box. Free to reuse with the code.
 * C major, 150 BPM, 4/4. Progression: C G Am F | C G F G | Am F C G | Am F G C
 */
export const DEMO_TITLE = "After School Jam (demo)";
export const DEMO_BPM = 150;
export const DEMO_BEATS_PER_BAR = 4;

const SEC_PER_BEAT = 60 / DEMO_BPM;

type Chord = { bass: number; triad: [number, number, number] };
const CHORDS: Record<string, Chord> = {
  C: { bass: 36, triad: [60, 64, 67] },
  G: { bass: 31, triad: [55, 59, 62] },
  Am: { bass: 33, triad: [57, 60, 64] },
  F: { bass: 29, triad: [53, 57, 60] },
};
const PROGRESSION = ["C", "G", "Am", "F", "C", "G", "F", "G", "Am", "F", "C", "G", "Am", "F", "G", "C"];

// [beat, pitch, lengthInBeats]
const MELODY: [number, number, number][] = [
  [0, 76, 1], [1, 79, 1], [2, 81, 0.5], [2.5, 79, 0.5], [3, 76, 1],
  [4, 74, 1.5], [5.5, 71, 0.5], [6, 74, 1], [7, 79, 1],
  [8, 72, 1], [9, 76, 1], [10, 81, 1.5], [11.5, 79, 0.5],
  [12, 77, 2], [14, 76, 1], [15, 72, 1],
  [16, 76, 0.5], [16.5, 76, 0.5], [17, 79, 1], [18, 84, 1], [19, 83, 1],
  [20, 81, 1], [21, 79, 1], [22, 74, 2],
  [24, 77, 1], [25, 81, 1], [26, 79, 1], [27, 77, 1],
  [28, 76, 1], [29, 74, 1], [30, 71, 1], [31, 74, 1],
  [32, 81, 1.5], [33.5, 79, 0.5], [34, 76, 1], [35, 72, 1],
  [36, 77, 1], [37, 81, 1], [38, 84, 2],
  [40, 83, 0.5], [40.5, 84, 0.5], [41, 83, 1], [42, 79, 1], [43, 76, 1],
  [44, 74, 3], [47, 79, 1],
  [48, 81, 1], [49, 83, 1], [50, 84, 1], [51, 81, 1],
  [52, 84, 1.5], [53.5, 81, 0.5], [54, 77, 2],
  [56, 79, 1], [57, 81, 1], [58, 83, 1], [59, 86, 1],
  [60, 84, 4],
];

function note(beat: number, pitch: number, beats: number, velocity: number): NoteEvent {
  return {
    pitch,
    start: +(beat * SEC_PER_BEAT).toFixed(4),
    duration: +(beats * SEC_PER_BEAT).toFixed(4),
    velocity,
  };
}

function buildParts(): Record<MemberId, NoteEvent[]> {
  const yui = MELODY.map(([b, p, l]) => note(b, p, l * 0.95, 0.8));
  const mio: NoteEvent[] = [];
  const ritsu: NoteEvent[] = [];
  const tsumugi: NoteEvent[] = [];
  const azusa: NoteEvent[] = [];

  PROGRESSION.forEach((name, bar) => {
    const chord = CHORDS[name]!;
    const b0 = bar * DEMO_BEATS_PER_BAR;
    const isLast = bar === PROGRESSION.length - 1;

    // Mio — driving eighth-note bass with a little lift at the end of the bar
    if (isLast) {
      mio.push(note(b0, chord.bass, 3.8, 0.85));
    } else {
      for (let i = 0; i < 8; i++) {
        const pitch = i === 6 ? chord.bass + 12 : i === 7 ? chord.bass + 7 : chord.bass;
        mio.push(note(b0 + i * 0.5, pitch, 0.45, i % 2 === 0 ? 0.85 : 0.65));
      }
    }

    // Azusa — muted eighth-note power chords
    const power = [chord.bass + 12, chord.bass + 19, chord.bass + 24];
    if (isLast) {
      power.forEach((p) => azusa.push(note(b0, p, 3.8, 0.75)));
    } else {
      for (let i = 0; i < 8; i++) {
        power.forEach((p) => azusa.push(note(b0 + i * 0.5, p, 0.35, i % 2 === 0 ? 0.7 : 0.5)));
      }
    }

    // Mugi — pads in the first half, broken chords in the second
    if (bar < 8 || isLast) {
      chord.triad.forEach((p) => tsumugi.push(note(b0, p, 3.9, 0.55)));
    } else {
      const order = [0, 1, 2, 1];
      order.forEach((idx, i) => tsumugi.push(note(b0 + i, chord.triad[idx]! + 12, 0.95, 0.5)));
    }

    // Ritsu — kick, snare, hats, crashes on section starts, tom fills
    if (bar === 0 || bar === 8 || isLast) ritsu.push(note(b0, 49, 1, 0.8));
    if (isLast) {
      ritsu.push(note(b0, 36, 1, 1));
      return;
    }
    [0, 2, 2.5].forEach((b) => ritsu.push(note(b0 + b, 36, 0.25, 0.95)));
    const fill = bar === 7 || bar === 15 - 1;
    [1, 3].forEach((b) => {
      if (!(fill && b === 3)) ritsu.push(note(b0 + b, 38, 0.25, 0.9));
    });
    for (let i = 0; i < 8; i++) {
      if (fill && i >= 6) break;
      ritsu.push(note(b0 + i * 0.5, i === 7 ? 46 : 42, 0.2, i % 2 === 0 ? 0.6 : 0.4));
    }
    if (fill) {
      [50, 47, 43, 41].forEach((p, i) => ritsu.push(note(b0 + 3 + i * 0.25, p, 0.25, 0.85)));
    }
  });

  const sorted = (notes: NoteEvent[]) => notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  return { yui: sorted(yui), mio: sorted(mio), ritsu: sorted(ritsu), tsumugi: sorted(tsumugi), azusa: sorted(azusa) };
}

export const DEMO_PARTS = buildParts();
export const DEMO_DURATION = PROGRESSION.length * DEMO_BEATS_PER_BAR * SEC_PER_BEAT;
