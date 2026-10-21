import type { NoteEvent } from "@/types/midi";

/**
 * Reading a song for its material, for the solo round: the chord of each bar, the chord
 * progression the song repeats most (usually the chorus), and each part's most played
 * bar (its "signature" figure: a riff, a groove, a hook). Pure; times in song seconds,
 * positions inside a bar in beats, quantized to sixteenths.
 */

export interface Chord {
  /** pitch class */
  root: number;
  minor: boolean;
}

export interface BarGrid {
  /** seconds per beat (quarter note) at the song's base tempo */
  beat: number;
  beatsPerBar: number;
}

const barSeconds = (g: BarGrid) => g.beat * g.beatsPerBar;
const sixteenth = (beats: number) => Math.round(beats * 4) / 4;

/**
 * The chord of each bar: every non-drum note's pitch class weighted by how long it sounds
 * in the bar, the lowest note counting double (the bass says the root), matched against
 * the 24 major and minor triads. `null` for a bar with nothing harmonic in it.
 */
export function barChords(parts: readonly (readonly NoteEvent[])[], grid: BarGrid, bars: number): (Chord | null)[] {
  const len = barSeconds(grid);
  const weights = Array.from({ length: bars }, () => new Array<number>(12).fill(0));
  const lowest = new Array<number>(bars).fill(128);
  for (const notes of parts) {
    for (const n of notes) {
      const first = Math.max(0, Math.floor(n.start / len + 1e-6));
      const last = Math.min(bars - 1, Math.floor((n.start + n.duration) / len - 1e-6));
      for (let bar = first; bar <= last; bar++) {
        const overlap = Math.min(n.start + n.duration, (bar + 1) * len) - Math.max(n.start, bar * len);
        if (overlap <= 0) continue;
        weights[bar]![n.pitch % 12]! += overlap;
        lowest[bar] = Math.min(lowest[bar]!, n.pitch);
      }
    }
  }
  return weights.map((w, bar) => {
    if (w.every((x) => x === 0)) return null;
    const bass = lowest[bar]! < 128 ? lowest[bar]! % 12 : -1;
    let best: Chord | null = null;
    let bestScore = -Infinity;
    for (let root = 0; root < 12; root++) {
      for (const minor of [false, true]) {
        const third = (root + (minor ? 3 : 4)) % 12;
        const fifth = (root + 7) % 12;
        const score = w[root]! * 1.2 + w[third]! + w[fifth]! * 0.8 + (bass === root ? w[root]! + len * 0.5 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = { root, minor };
        }
      }
    }
    return best;
  });
}

/**
 * The four bars of chords the song plays most often (counting every starting bar), so the
 * solos run over the song's own changes: usually the chorus. `null` when no four bars in a
 * row have chords.
 */
export function commonProgression(
  chords: readonly (Chord | null)[],
  length = 4,
  key?: { tonic: number; minor: boolean },
): Chord[] | null {
  // with the key known, a progression with chromatic passing chords (Fuwa Fuwa Time's
  // B – C – C#m climb) counts for less than one that stays in the key
  const scale = key ? (key.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]) : null;
  const inKey = (c: Chord) =>
    !scale || (scale.includes((c.root - key!.tonic + 12) % 12) && scale.includes((c.root + (c.minor ? 3 : 4) - key!.tonic + 12) % 12));
  const weight = (window: Chord[]) => (window.every(inKey) ? 1 : 0.3);
  const counts = new Map<string, { count: number; first: number }>();
  for (let i = 0; i + length <= chords.length; i++) {
    const window = chords.slice(i, i + length);
    if (window.some((c) => c === null)) continue;
    // a window of one chord held for four bars isn't much of a progression
    const key = window.map((c) => `${c!.root}${c!.minor ? "m" : ""}`).join(" ");
    if (new Set(key.split(" ")).size < 2) continue;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { count: 1, first: i });
  }
  let best: { score: number; first: number } | null = null;
  for (const e of counts.values()) {
    const score = e.count * weight(chords.slice(e.first, e.first + length) as Chord[]);
    if (!best || score > best.score || (score === best.score && e.first < best.first)) best = { score, first: e.first };
  }
  return best ? (chords.slice(best.first, best.first + length) as Chord[]) : null;
}

/** One note of a figure: where it starts in the bar (beats), its pitch, how long (beats). */
export interface FigureNote {
  beat: number;
  pitch: number;
  beats: number;
}

export interface Figure {
  /** the bar the figure was taken from */
  bar: number;
  notes: FigureNote[];
  /** that bar's chord, when known */
  chord: Chord | null;
}

/** A part's notes, bar by bar, as a single top line (the highest note at each onset). */
function topLines(notes: readonly NoteEvent[], grid: BarGrid): Map<number, FigureNote[]> {
  const len = barSeconds(grid);
  const byOnset = new Map<string, FigureNote & { bar: number }>();
  for (const n of notes) {
    const bar = Math.floor(n.start / len + 1e-6);
    const beat = sixteenth((n.start - bar * len) / grid.beat);
    if (beat >= grid.beatsPerBar) continue;
    const key = `${bar}:${beat}`;
    const had = byOnset.get(key);
    if (!had || n.pitch > had.pitch) byOnset.set(key, { bar, beat, pitch: n.pitch, beats: Math.max(0.25, sixteenth(n.duration / grid.beat)) });
  }
  const lines = new Map<number, FigureNote[]>();
  for (const { bar, ...note } of byOnset.values()) {
    const line = lines.get(bar);
    if (line) line.push(note);
    else lines.set(bar, [note]);
  }
  for (const line of lines.values()) {
    line.sort((a, b) => a.beat - b.beat);
    // a note lasts until the next one at most: a line, not a pile-up
    line.forEach((n, i) => {
      const next = line[i + 1];
      n.beats = Math.min(n.beats, (next ? next.beat : grid.beatsPerBar) - n.beat);
    });
  }
  return lines;
}

/**
 * A part's most played bar: bars are compared by their top line's rhythm and intervals
 * (so the same riff on another chord counts as the same), the most repeated one wins,
 * earliest first. Only bars with at least `minNotes` notes count. `null` when the part has
 * no such bar.
 */
export function signatureFigure(
  notes: readonly NoteEvent[],
  grid: BarGrid,
  chords: readonly (Chord | null)[],
  minNotes = 3,
): Figure | null {
  const counts = new Map<string, { count: number; bar: number; notes: FigureNote[] }>();
  for (const [bar, line] of topLines(notes, grid)) {
    // a figure needs a shape: one note repeated (a pedal, a strummed chord's top note)
    // isn't something to build a solo on
    const distinct = new Set(line.map((n) => n.pitch)).size;
    if (line.length < minNotes || distinct < Math.min(minNotes, 3)) continue;
    const first = line[0]!.pitch;
    const key = line.map((n) => `${n.beat}:${n.pitch - first}`).join(",");
    const entry = counts.get(key);
    if (entry) {
      entry.count += 1;
      if (bar < entry.bar) {
        entry.bar = bar;
        entry.notes = line;
      }
    } else counts.set(key, { count: 1, bar, notes: line });
  }
  // how often it's played, and how much it moves (up to four different notes counts)
  const score = (e: { count: number; notes: FigureNote[] }) => e.count * Math.min(4, new Set(e.notes.map((n) => n.pitch)).size);
  let best: { count: number; bar: number; notes: FigureNote[] } | null = null;
  for (const e of counts.values()) {
    if (!best || score(e) > score(best) || (score(e) === score(best) && e.bar < best.bar)) best = e;
  }
  return best ? { bar: best.bar, notes: best.notes, chord: chords[best.bar] ?? null } : null;
}

/** A drum hit inside a bar. */
export interface DrumHit {
  beat: number;
  pitch: number;
  velocity: number;
}

/** The drum part's most played bar (every hit, not a top line), compared by onset and drum. */
export function signatureGroove(notes: readonly NoteEvent[], grid: BarGrid): DrumHit[] | null {
  const len = barSeconds(grid);
  const bars = new Map<number, DrumHit[]>();
  for (const n of notes) {
    const bar = Math.floor(n.start / len + 1e-6);
    const beat = sixteenth((n.start - bar * len) / grid.beat);
    if (beat >= grid.beatsPerBar) continue;
    const hits = bars.get(bar);
    const hit = { beat, pitch: n.pitch, velocity: n.velocity };
    if (hits) hits.push(hit);
    else bars.set(bar, [hit]);
  }
  const counts = new Map<string, { count: number; bar: number; hits: DrumHit[] }>();
  for (const [bar, hits] of bars) {
    if (hits.length < 4) continue;
    hits.sort((a, b) => a.beat - b.beat || a.pitch - b.pitch);
    const key = hits.map((h) => `${h.beat}:${h.pitch}`).join(",");
    const entry = counts.get(key);
    if (entry) {
      entry.count += 1;
      if (bar < entry.bar) entry.bar = bar;
    } else counts.set(key, { count: 1, bar, hits });
  }
  let best: { count: number; bar: number; hits: DrumHit[] } | null = null;
  for (const e of counts.values()) if (!best || e.count > best.count || (e.count === best.count && e.bar < best.bar)) best = e;
  return best?.hits ?? null;
}
