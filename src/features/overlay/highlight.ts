import { drumVoiceFor, type DrumVoice } from "@/lib/drums";
import type { NoteEvent } from "@/types/midi";
import type { StudioProject } from "@/types/project";

/**
 * The "highlight" take (pure): the best CLIP_MIN–CLIP_MAX seconds of a song for a Reels clip
 * that loops. In whole bars, so it loops on the downbeat, any number of them (the length
 * is free; whole 4- and 8-bar phrases score a little more). What makes a stretch the one:
 *
 * - it's busy: notes per bar (drums at half weight, the hi-hat alone would otherwise win)
 *   and how many members play, against the song's busiest stretch;
 * - it starts where a section starts: a crash on the downbeat, the singer coming in, the
 *   band louder than the bars before, on a phrase line;
 * - it repeats elsewhere in the song (a chorus comes back; a bridge doesn't), and it's
 *   sung: the tune is what people know a song by, so bars with the vocal count more (an
 *   instrumental riff, however busy, ranks under the chorus);
 * - it loops without a seam. Either its last bar sounds like the bar *before* its start
 *   (going from its end back to its start is the song's own way into the start), or the
 *   bar after it like its first bar (the song itself comes back here). "Sounds
 *   like" compares every member's part: chords (time per pitch class) and rhythm (onsets
 *   on a 16th grid; drums as kick, snare and cymbals). Notes held into its first bar from
 *   before count against it: a loop starts them over, so they'd be missing.
 *
 * The seam comes first: when nothing from CLIP_MIN to CLIP_MAX s loops well (seam below
 * GOOD_SEAM), the clip may stretch to STRETCH_MIN–STRETCH_MAX s for one that does. A clip
 * can also be one stretch played twice (`repeats`), scored a little lower than a stretch
 * played once: Fuwa Fuwa Time's chorus only repeats in 8-bar halves, 10.7 s at 180 BPM,
 * and nothing between 13 and 22 s looped well (best seam 0.72), but its first half twice
 * is 21.3 s and loops exactly (the song plays it twice itself).
 */
export const CLIP_MIN = 15;
export const CLIP_MAX = 20;
const STRETCH_MIN = 13;
const STRETCH_MAX = 22;
/** A seam this alike (0–1, see `alike`) loops without a noticeable change; a bar repeated exactly is 1. */
export const GOOD_SEAM = 0.85;
const GRID = 16;

export interface Highlight {
  /** song seconds */
  start: number;
  end: number;
  /** bar numbers, from 0 */
  firstBar: number;
  bars: number;
  /** the stretch is played this many times in the clip (1, or 2 for a short section) */
  repeats: number;
}

/** A clip's length in real seconds at the playing tempo. */
export function clipSeconds(h: Highlight, baseBpm: number, bpm: number): number {
  return ((h.end - h.start) * h.repeats * baseBpm) / Math.max(1, bpm || baseBpm);
}

/** The clip lengths (bars) to try: every whole number of bars from `min` to `max` s, else the nearest. */
export function clipLengths(barSeconds: number, min = CLIP_MIN, max = CLIP_MAX): number[] {
  const out: number[] = [];
  for (let n = 1; n * barSeconds <= max + 1e-6; n++) if (n * barSeconds >= min - 1e-6) out.push(n);
  return out.length ? out : [Math.max(1, Math.round((min + max) / 2 / barSeconds))];
}

/** One part's picture of each bar: chords and rhythm, as a vector per bar. */
interface PartBars {
  dims: number;
  values: Float32Array; // total × dims
  sounding: Uint8Array; // total
}

const DRUM_GROUPS: Partial<Record<DrumVoice, number>> = {
  kick: 0,
  snare: 1,
  clap: 1,
  tom: 1,
  "closed-hat": 2,
  "open-hat": 2,
  ride: 2,
  crash: 2,
};

function partBars(
  notes: readonly NoteEvent[],
  drums: boolean,
  total: number,
  barSeconds: number,
): PartBars {
  // drums: three rhythm rows; pitched parts: 12 pitch classes plus one rhythm row
  const dims = drums ? 3 * GRID : 12 + GRID;
  const values = new Float32Array(total * dims);
  const sounding = new Uint8Array(total);
  for (const n of notes) {
    const b = Math.floor(n.start / barSeconds + 1e-6);
    if (b < 0 || b >= total) continue;
    sounding[b] = 1;
    const step = Math.min(
      GRID - 1,
      Math.floor(((n.start - b * barSeconds) / barSeconds) * GRID + 0.5),
    );
    if (drums) {
      const row = DRUM_GROUPS[drumVoiceFor(n.pitch)] ?? 2;
      values[b * dims + row * GRID + step]! += n.velocity;
    } else {
      values[b * dims + (((n.pitch % 12) + 12) % 12)]! += Math.min(n.duration, barSeconds);
      values[b * dims + 12 + step]! += n.velocity * 0.5;
    }
  }
  return { dims, values, sounding };
}

function partAlike(p: PartBars, a: number, b: number): number {
  const sa = p.sounding[a]!;
  const sb = p.sounding[b]!;
  if (!sa && !sb) return 1; // silent in both: alike
  if (!sa || !sb) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let k = 0; k < p.dims; k++) {
    const x = p.values[a * p.dims + k]!;
    const y = p.values[b * p.dims + k]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** How many different highlights "next section" offers. */
export const HIGHLIGHT_CHOICES = 5;

/**
 * Finds the highlight in the song's own notes up to `songEnd` (the solo round after it
 * doesn't count), or null when the song is shorter than the clip or has no notes. Lengths
 * are in real seconds at the playing tempo (`project.bpm`). `choice` picks the next best
 * ones (wrapping round), each from a different part of the song.
 */
export function findHighlight(
  project: StudioProject,
  songEnd = project.durationSeconds,
  choice = 0,
): Highlight | null {
  const list = highlightChoices(project, songEnd);
  return list.length ? list[choice % list.length]! : null;
}

/** The best clips from different parts of the song (none mostly inside another), best first. Cached. */
export function highlightChoices(
  project: StudioProject,
  songEnd = project.durationSeconds,
): RankedHighlight[] {
  // the same music as last time (a fader moved, which makes a new project): the same answer
  const key = [project.baseBpm, project.bpm, project.beatsPerBar, project.durationSeconds, songEnd];
  const sources = project.tracks.flatMap((t) => [t.notes, t.vocal]);
  if (
    last &&
    last.key.every((v, i) => v === key[i]) &&
    last.sources.length === sources.length &&
    last.sources.every((s, i) => s === sources[i])
  ) {
    return last.value;
  }
  const value: RankedHighlight[] = [];
  for (const c of rankHighlights(project, songEnd, Infinity)) {
    const overlaps = value.some(
      (v) =>
        Math.min(v.end, c.end) - Math.max(v.start, c.start) >
        0.5 * Math.min(v.end - v.start, c.end - c.start),
    );
    if (!overlaps) value.push(c);
    if (value.length === HIGHLIGHT_CHOICES) break;
  }
  last = { key, sources, value };
  return value;
}

let last: { key: unknown[]; sources: unknown[]; value: RankedHighlight[] } | null = null;

/** A candidate clip and why it scored what it did (for checking the choice against real songs). */
export interface RankedHighlight extends Highlight {
  score: number;
  density: number;
  seam: number;
}

/** The `count` best clips, best first (uncached: findHighlight is the one to call per frame). */
export function rankHighlights(
  project: StudioProject,
  songEnd = project.durationSeconds,
  count = 5,
): RankedHighlight[] {
  const barSeconds = (60 / project.baseBpm) * project.beatsPerBar;
  const realBar = (barSeconds * project.baseBpm) / (project.bpm || project.baseBpm);
  const end = Math.min(project.durationSeconds, songEnd);
  const total = Math.floor(end / barSeconds + 1e-6);
  // [bars, repeats]: once through, or a stretch of at least 4 bars twice
  const sizes = (min: number, max: number) => [
    ...clipLengths(realBar, min, max).map((n): [number, number] => [n, 1]),
    ...clipLengths(realBar * 2, min, max)
      .filter((n) => n >= 4 && n * realBar * 2 >= min - 1e-6 && n * realBar * 2 <= max + 1e-6)
      .map((n): [number, number] => [n, 2]),
  ];
  const lengths = sizes(CLIP_MIN, CLIP_MAX).filter(([n]) => n <= total);
  const stretched = sizes(STRETCH_MIN, STRETCH_MAX).filter(
    ([n, k]) => n <= total && !lengths.some(([m, j]) => m === n && j === k),
  );
  if (!lengths.length && !stretched.length) return [];

  const song = analyse(project, barSeconds, total);
  if (!song) return [];
  const { busy, crashAt, singerIn, heldIn, alike, mean, sungPrefix, hasVocal, recurs } = song;
  const firstPlayed = busy.findIndex((v) => v > 0);
  let top = 0;
  for (const [n] of [...lengths, ...stretched])
    for (let b = 0; b + n <= total; b++) top = Math.max(top, mean(b, b + n));
  const rank = (list: [number, number][]) => {
    const ranked: RankedHighlight[] = [];
    for (const [n, repeats] of list) {
      const phrase = n % 8 === 0 ? 0.08 : n % 4 === 0 ? 0.05 : n % 2 === 0 ? 0.02 : 0;
      // the same stretch twice is less to watch than one going on
      const twice = repeats > 1 ? 0.15 : 0;
      for (let b = 0; b + n <= total; b++) {
        const density = mean(b, b + n) / Math.max(1, top);
        const rise = Math.max(
          0,
          Math.min(1, (mean(b, b + 2) - mean(b - 2, b)) / Math.max(1, mean(b, b + 2))),
        );
        const line = (b - firstPlayed) % 8 === 0 ? 0.1 : (b - firstPlayed) % 4 === 0 ? 0.06 : 0;
        // the seam, end → start, sounds like the song if either the song goes into the start
        // from a bar like the end, or comes back to a bar like the start right after the end
        // (a chorus's first line: the bar before it is the pre-chorus, but its second half
        // starts like its first)
        const seam = Math.max(alike(b + n - 1, b - 1), alike(b + n, b));
        const held = Math.min(1, heldIn[b]! / barSeconds);
        const singing = hasVocal ? (sungPrefix[b + n]! - sungPrefix[b]!) / n : 0;
        const score =
          density +
          0.1 * crashAt[b]! +
          0.08 * singerIn[b]! +
          0.12 * rise +
          line +
          0.1 * recurs[b]! +
          0.3 * singing +
          1.0 * seam -
          0.1 * held +
          phrase -
          twice;
        ranked.push({
          start: b * barSeconds,
          end: (b + n) * barSeconds,
          firstBar: b,
          bars: n,
          repeats,
          score,
          density,
          seam,
        });
      }
    }
    return ranked.sort((a, b) => b.score - a.score);
  };
  // in range and looping well first; then a little shorter or longer, if that loops well
  // (first when nothing in range does); then the rest in range
  const inRange = rank(lengths);
  const smooth = rank(stretched).filter((c) => c.seam >= GOOD_SEAM);
  return [
    ...inRange.filter((c) => c.seam >= GOOD_SEAM),
    ...smooth,
    ...inRange.filter((c) => c.seam < GOOD_SEAM),
  ].slice(0, count);
}

/**
 * What the song's bars are like: how busy each is, where crashes, the singer and held-over
 * notes are, and `alike`, how much two bars sound the same (every part's chords and rhythm).
 * Null when nothing plays.
 */
function analyse(project: StudioProject, barSeconds: number, total: number) {
  const busy = new Float32Array(total);
  const crashAt = new Uint8Array(total);
  const singerIn = new Uint8Array(total);
  const sung = new Uint8Array(total);
  // seconds of notes held over each bar line from the bar before (missing when a loop starts there)
  const heldIn = new Float32Array(total);
  const parts: PartBars[] = [];
  const bar = (t: number) => Math.floor(t / barSeconds + 1e-6);
  const beat = barSeconds / project.beatsPerBar;
  const add = (notes: readonly NoteEvent[], drums: boolean, vocal: boolean) => {
    const p = partBars(notes, drums, total, barSeconds);
    // a part that never plays (here) would make every pair of bars look alike
    if (p.sounding.some((v) => v)) parts.push(p);
    for (const n of notes) {
      const b = bar(n.start);
      if (b < 0 || b >= total) continue;
      busy[b]! += drums ? 0.5 : 1;
      const into = n.start - b * barSeconds;
      if (drums && into < beat / 2 && drumVoiceFor(n.pitch) === "crash") crashAt[b] = 1;
      if (vocal && into < beat) singerIn[b] = 1;
      if (vocal) sung[b] = 1;
      const next = (b + 1) * barSeconds;
      if (!drums && b + 1 < total && n.start + n.duration > next + beat / 4)
        heldIn[b + 1]! += Math.min(n.start + n.duration - next, barSeconds);
    }
    for (let b = 0; b < total; b++) busy[b]! += 4 * p.sounding[b]!;
  };
  for (const track of project.tracks) {
    add(track.notes, track.instrument === "drums", false);
    if (track.vocal?.length) add(track.vocal, false, true);
  }
  if (busy.every((v) => v === 0)) return null;

  const alike = (a: number, b: number) => {
    if (a < 0 || b < 0 || a >= total || b >= total) return 0;
    let sum = 0;
    for (const p of parts) sum += partAlike(p, a, b);
    return parts.length ? sum / parts.length : 0;
  };
  const prefix = new Float64Array(total + 1);
  for (let b = 0; b < total; b++) prefix[b + 1] = prefix[b]! + busy[b]!;
  const sungPrefix = new Float64Array(total + 1);
  for (let b = 0; b < total; b++) sungPrefix[b + 1] = sungPrefix[b]! + sung[b]!;
  const hasVocal = sungPrefix[total]! > 0;
  const mean = (from: number, to: number) => {
    const a = Math.max(0, from);
    const z = Math.min(total, to);
    return z > a ? (prefix[z]! - prefix[a]!) / (z - a) : 0;
  };
  // a chorus comes back: how many other places its first 4 bars recur (at least 4 bars away)
  const recurs = new Float32Array(total);
  for (let b = 0; b + 4 <= total; b++) {
    let k = 0;
    for (let c = 0; c + 4 <= total; c++) {
      if (Math.abs(c - b) < 4) continue;
      let s = 0;
      for (let i = 0; i < 4; i++) s += alike(b + i, c + i);
      if (s / 4 >= 0.8) k++;
    }
    recurs[b] = Math.min(2, k) / 2;
  }

  return { busy, crashAt, singerIn, sung, heldIn, alike, mean, sungPrefix, hasVocal, recurs };
}

/** How many different choruses "next" offers. */
export const CHORUS_CHOICES = 3;
/** Chorus lengths tried, in bars: any from 8 to 32 (a chorus can be 15 bars and a break). */
const CHORUS_BARS = Array.from({ length: 25 }, (_, i) => 8 + i);
/**
 * A block counts as coming back elsewhere when its bars sound this alike on average. A song
 * where nothing comes back that closely (a TV-size cut has one chorus; a tab with every
 * repeat written out differently) is searched again with the next, looser bar, rather than
 * offering no chorus at all (lowering it for every song picked worse ones where the strict
 * bar worked).
 */
const REPEATED = [0.7, 0.5, 0];
/** A change this big between two bars is a new section (bars inside one section change less). */
const INSIDE_CHANGE = 0.45;

/**
 * The song's climactic chorus, whole, however long it is: a stretch that the song plays
 * again elsewhere (a verse doesn't come back as often, and a
 * bridge doesn't come back at all), standing out from what comes before it and after it
 * (a section boundary at each end: the music changes there), busy, sung, and, all else
 * equal, late (the last chorus is usually the biggest). `choice` picks the next ones.
 */
export function findChorus(
  project: StudioProject,
  songEnd = project.durationSeconds,
  choice = 0,
): Highlight | null {
  const list = chorusChoices(project, songEnd);
  return list.length ? list[choice % list.length]! : null;
}

/** The best choruses that don't overlap, best first. Cached like highlightChoices. */
export function chorusChoices(
  project: StudioProject,
  songEnd = project.durationSeconds,
): RankedHighlight[] {
  const key = [project.baseBpm, project.bpm, project.beatsPerBar, project.durationSeconds, songEnd];
  const sources = project.tracks.flatMap((t) => [t.notes, t.vocal]);
  if (
    lastChorus &&
    lastChorus.key.every((v, i) => v === key[i]) &&
    lastChorus.sources.every((x, i) => x === sources[i]) &&
    lastChorus.sources.length === sources.length
  ) {
    return lastChorus.value;
  }
  const value: RankedHighlight[] = [];
  for (const c of rankChoruses(project, songEnd)) {
    if (!value.some((v) => Math.min(v.end, c.end) > Math.max(v.start, c.start))) value.push(c);
    if (value.length === CHORUS_CHOICES) break;
  }
  lastChorus = { key, sources, value };
  return value;
}

let lastChorus: { key: unknown[]; sources: unknown[]; value: RankedHighlight[] } | null = null;

/** Every chorus candidate, best first (`seam` here is how alike it is to its repeat). */
export function rankChoruses(
  project: StudioProject,
  songEnd = project.durationSeconds,
): RankedHighlight[] {
  for (const repeated of REPEATED) {
    const ranked = rankChorusesAt(project, songEnd, repeated);
    if (ranked.length) return ranked;
  }
  return [];
}

function rankChorusesAt(
  project: StudioProject,
  songEnd: number,
  repeated: number,
): RankedHighlight[] {
  const barSeconds = (60 / project.baseBpm) * project.beatsPerBar;
  const end = Math.min(project.durationSeconds, songEnd);
  const total = Math.floor(end / barSeconds + 1e-6);
  const song = analyse(project, barSeconds, total);
  if (!song || total < 8) return [];
  const { busy, crashAt, alike, mean, sungPrefix, hasVocal } = song;
  // every pair of bars once, and running sums down each diagonal: a block's likeness to
  // another block is then two lookups
  const sim = new Float32Array(total * total);
  for (let i = 0; i < total; i++) {
    for (let j = i; j < total; j++) {
      const v = alike(i, j);
      sim[i * total + j] = v;
      sim[j * total + i] = v;
    }
  }
  const w = total + 1;
  const diag = new Float32Array(w * w);
  for (let i = 0; i < total; i++)
    for (let j = 0; j < total; j++)
      diag[(i + 1) * w + j + 1] = diag[i * w + j]! + sim[i * total + j]!;
  const block = (a: number, c: number, n: number) =>
    (diag[(a + n) * w + c + n]! - diag[a * w + c]!) / n;
  const like = (a: number, b: number) =>
    a < 0 || b < 0 || a >= total || b >= total ? 0 : sim[a * total + b]!;

  const firstPlayed = busy.findIndex((v) => v > 0);
  let top = 0;
  for (const n of CHORUS_BARS)
    for (let b = 0; b + n <= total; b++) top = Math.max(top, mean(b, b + n));
  const ranked: RankedHighlight[] = [];
  for (const n of CHORUS_BARS) {
    for (let b = Math.max(0, firstPlayed); b + n <= total; b += 1) {
      // played again elsewhere, without overlapping
      let repeat = 0;
      for (let c = 0; c + n <= total; c++)
        if (Math.abs(c - b) >= n) repeat = Math.max(repeat, block(b, c, n));
      if (repeat < repeated) continue;
      const e = b + n;
      // the music changes going in, and going out (and doesn't just carry on like its start)
      // a change between two bars: how unlike the bars either side of the line are
      const change = (k: number) => 1 - (like(k - 1, k) + like(k - 2, k + 1)) / 2;
      const into = change(b);
      // a chorus is one section: a bigger change inside it than at its ends means it runs
      // into the next section (a chorus and the riff after it)
      let inside = 0;
      for (let k = b + 2; k <= e - 2; k++) inside = Math.max(inside, change(k));
      // (the song's end says nothing either way: counting it as a change pulled the last
      // chorus and whatever follows it into one clip)
      const out =
        e >= total
          ? 0.5
          : 1 -
            Math.max(
              (like(e - 1, e) + like(e - 2, e + 1)) / 2,
              (like(b, e) + like(b + 1, e + 1)) / 2,
            );
      const density = mean(b, e) / Math.max(1, top);
      const rise = Math.max(
        0,
        Math.min(1, (mean(b, b + 2) - mean(b - 2, b)) / Math.max(1, mean(b, b + 2))),
      );
      const singing = hasVocal ? (sungPrefix[e]! - sungPrefix[b]!) / n : 0;
      const score =
        density +
        0.3 * singing +
        0.4 * into +
        0.4 * out -
        0.8 * Math.max(0, inside - INSIDE_CHANGE) +
        0.12 * rise +
        0.1 * crashAt[b]! +
        0.3 * repeat +
        0.08 * (b / total) +
        // a chorus is usually 12 to 24 bars; an 8-bar stretch is more often a riff or half a chorus
        (n >= 12 && n <= 24 ? 0.15 : n > 24 ? 0.05 : 0) +
        (n % 8 === 0 ? 0.05 : n % 4 === 0 ? 0.03 : 0) +
        ((b - firstPlayed) % 4 === 0 ? 0.04 : 0);
      ranked.push({
        start: b * barSeconds,
        end: e * barSeconds,
        firstBar: b,
        bars: n,
        repeats: 1,
        score,
        density,
        seam: repeat,
      });
    }
  }
  return ranked.sort((x, y) => y.score - x.score);
}

const tiled = new WeakMap<
  readonly NoteEvent[],
  { start: number; end: number; notes: NoteEvent[] }
>();

/**
 * The notes of a part as the highlight loop plays them, for the picture: the clip's own
 * notes, and copies a loop before and after, so the last frame (the next loop's notes
 * already coming) is the first frame again. Memoised per notes array.
 */
export function loopNotes(notes: readonly NoteEvent[], h: Highlight): NoteEvent[] {
  const memo = tiled.get(notes);
  if (memo && memo.start === h.start && memo.end === h.end) return memo.notes;
  const length = h.end - h.start;
  const inside = notes.filter((n) => n.start >= h.start - 1e-6 && n.start < h.end - 1e-6);
  const out = [-length, 0, length].flatMap((shift) =>
    inside.map((n) => (shift === 0 ? n : { ...n, start: n.start + shift })),
  );
  tiled.set(notes, { start: h.start, end: h.end, notes: out });
  return out;
}
