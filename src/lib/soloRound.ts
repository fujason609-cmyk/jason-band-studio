import type { MemberId } from "@/features/band/types";
import type { InstrumentId } from "@/types/audio";
import type { NoteEvent } from "@/types/midi";
import { barChords, commonProgression, signatureFigure, signatureGroove, type Chord, type DrumHit, type Figure } from "./scoreAnalysis";

/**
 * The solo round: after the song, every member takes a 4-bar solo in turn (Ritsu, Mio,
 * Mugi, Azusa, then Yui to close) and the band ends together on one big chord.
 *
 * The solos come from the song itself (lib/scoreAnalysis): they run over the chord
 * progression the song repeats most, and each member develops their own most played bar
 * in this song, in their character, on whatever instrument they are playing:
 *
 *   drums          Ritsu: her groove, then with ghost notes, its kicks under a tom run, a fill
 *   bass           Mio: her groove on the solo chords, octave pops, a walk up to finish
 *   keys           Mugi: her phrase in thirds, the chord as a classical arpeggio, a run up
 *   rhythm guitar  Azusa: her line, then fast runs between its notes, a climb to the tonic
 *   lead guitar    Yui: her hook, a step higher, twice as fast, then a long high note
 *
 * A member with nothing to play in the song develops the song's tune (the vocal, else
 * Yui's part); with no material at all, a solo written for the instrument (`generic…`).
 * While someone solos, Ritsu keeps a soft beat and Mio plays the roots underneath, quietly
 * (velocities set so the soloist is clearly on top; a drum solo plays alone). Everything
 * is in the song's key. Pure and deterministic: the same song always gets the same solos.
 */
export const SOLO_ORDER: MemberId[] = ["ritsu", "mio", "tsumugi", "azusa", "yui"];
export const SOLO_BARS = 4;

export interface SoloSpot {
  member: MemberId;
  /** song seconds */
  start: number;
  end: number;
}

export interface SoloRound {
  notes: Record<MemberId, NoteEvent[]>;
  spots: SoloSpot[];
  /** song seconds where the round (and so the song) ends, on a bar line */
  end: number;
}

export interface SoloTrack {
  memberId: MemberId;
  instrument: InstrumentId;
  notes: readonly NoteEvent[];
  /** what the member sings, if anything (the song's tune for whoever has no part) */
  vocal?: readonly NoteEvent[];
}

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export interface Key {
  /** pitch class of the tonic, 0 = C */
  tonic: number;
  minor: boolean;
}

/** The song's key: its notes' pitch classes (weighted by length) against the Krumhansl key profiles. */
export function detectKey(notes: Iterable<NoteEvent>): Key {
  const weight = new Array<number>(12).fill(0);
  for (const n of notes) weight[((n.pitch % 12) + 12) % 12]! += n.duration;
  if (weight.every((w) => w === 0)) return { tonic: 0, minor: false };
  let best: Key = { tonic: 0, minor: false };
  let bestScore = -Infinity;
  for (const minor of [false, true]) {
    const profile = minor ? MINOR_PROFILE : MAJOR_PROFILE;
    for (let tonic = 0; tonic < 12; tonic++) {
      let score = 0;
      for (let pc = 0; pc < 12; pc++) score += weight[pc]! * profile[(pc - tonic + 12) % 12]!;
      if (score > bestScore) {
        bestScore = score;
        best = { tonic, minor };
      }
    }
  }
  return best;
}

/** Small seeded generator: the same song always gets the same solos. */
function random(seedText: string) {
  let s = 2166136261;
  for (const ch of seedText) s = Math.imul(s ^ ch.charCodeAt(0), 16777619);
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507);
    s = Math.imul(s ^ (s >>> 13), 3266489909);
    return ((s ^= s >>> 16) >>> 0) / 4294967296;
  };
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_PENTA = [0, 2, 4, 7, 9];
const MINOR_PENTA = [0, 3, 5, 7, 10];

/** When the song has no repeated progression: I V vi IV in a major key, i VI III VII in a minor one. */
function progression(key: Key): Chord[] {
  const steps = key.minor
    ? [
        [0, true],
        [8, false],
        [3, false],
        [10, false],
      ]
    : [
        [0, false],
        [7, false],
        [9, true],
        [5, false],
      ];
  return steps.map(([step, minor]) => ({ root: (key.tonic + (step as number)) % 12, minor: minor as boolean }));
}

/** The pitch of class `pc` nearest to `around`. */
function near(pc: number, around: number): number {
  const base = around - (((around - pc) % 12) + 12) % 12;
  return around - base > 6 ? base + 12 : base;
}

/** Scale (pitch classes) as actual pitches from `low` to `high`. */
function scalePitches(key: Key, intervals: number[], low: number, high: number): number[] {
  const out: number[] = [];
  for (let p = low; p <= high; p++) if (intervals.includes((p - key.tonic + 120) % 12)) out.push(p);
  return out;
}

const inScale = (pitch: number, key: Key) =>
  (key.minor ? MINOR_SCALE : MAJOR_SCALE).includes((((pitch - key.tonic) % 12) + 12) % 12);

/** `pitch` moved to the nearest note of the key's scale (down on a tie). */
function snap(pitch: number, key: Key): number {
  for (let d = 0; d < 6; d++) {
    if (inScale(pitch - d, key)) return pitch - d;
    if (inScale(pitch + d, key)) return pitch + d;
  }
  return pitch;
}

/** `pitch` moved `steps` notes along the key's scale (up for positive). */
function scaleStep(pitch: number, steps: number, key: Key): number {
  let p = snap(pitch, key);
  const dir = Math.sign(steps);
  for (let i = 0; i < Math.abs(steps); i++) {
    p += dir;
    while (!inScale(p, key)) p += dir;
  }
  return p;
}

/** Into an instrument's range, by octaves. */
function inRange(pitch: number, low: number, high: number): number {
  let p = pitch;
  while (p < low) p += 12;
  while (p > high) p -= 12;
  return p;
}

interface PlacedNote {
  beat: number;
  pitch: number;
  beats: number;
}

/**
 * A figure moved onto `chord`: shifted so its first note lands on the chord tone nearest
 * where it was, its shape kept, in the instrument's range, every note in the key.
 */
function placeFigure(figure: Figure, chord: Chord, key: Key, low: number, high: number): PlacedNote[] {
  const first = figure.notes[0]!.pitch;
  const tones = [0, chord.minor ? 3 : 4, 7].map((t) => near((chord.root + t) % 12, first));
  const target = tones.reduce((a, b) => (Math.abs(b - first) < Math.abs(a - first) ? b : a));
  const shift = inRange(target, low, high) - first;
  return figure.notes.map((n) => ({ beat: n.beat, pitch: snap(n.pitch + shift, key), beats: n.beats }));
}

type Hit = [beat: number, pitch: number, beats: number, velocity: number];

interface SoloContext {
  key: Key;
  chords: Chord[];
  beatsPerBar: number;
  rand: () => number;
  /** the soloist's own most played bar in this song (a melodic figure), if they have one */
  figure: Figure | null;
  /** the song's tune: the sung part, else Yui's part (for a soloist without a part) */
  melody: Figure | null;
  /** the soloist's own most played drum bar, if their part is drums */
  groove: DrumHit[] | null;
}

const KICK = 36;
const SNARE = 38;
const HAT = 42;
const CRASH = 49;
const TOMS = [50, 48, 47, 45, 43, 41];
const isKick = (p: number) => p === 35 || p === 36;
const isSnare = (p: number) => p === 37 || p === 38 || p === 40;

// ---- written for the instrument: used when the song gives a member no material ----

function genericDrumSolo({ beatsPerBar, rand }: SoloContext): Hit[] {
  const out: Hit[] = [];
  const bar = (b: number) => b * beatsPerBar;
  for (let beat = 0; beat < beatsPerBar; beat++) {
    // bar 1: the groove, with ghost notes
    const t = bar(0) + beat;
    out.push([t, beat % 2 === 0 ? KICK : SNARE, 0.25, beat % 2 === 0 ? 0.95 : 0.9], [t, HAT, 0.25, 0.6], [t + 0.5, HAT, 0.25, 0.45]);
    if (rand() < 0.6) out.push([t + 0.75, SNARE, 0.2, 0.35]);
    // bar 2: snare sixteenths, accents on the beat, kick underneath
    for (let i = 0; i < 4; i++) out.push([bar(1) + beat + i / 4, SNARE, 0.2, i === 0 ? 0.95 : 0.55 + rand() * 0.15]);
    out.push([bar(1) + beat, KICK, 0.25, 0.85]);
  }
  // bar 3: down the toms in sixteenths
  const sixteenths = beatsPerBar * 4;
  for (let i = 0; i < sixteenths; i++) out.push([bar(2) + i / 4, TOMS[Math.floor((i / sixteenths) * TOMS.length)]!, 0.2, 0.7 + (i % 4 === 0 ? 0.25 : 0)]);
  // bar 4: kick and snare trading, then triplets on the snare into the last beat
  for (let i = 0; i < (beatsPerBar - 1) * 4; i++) out.push([bar(3) + i / 4, i % 2 === 0 ? KICK : SNARE, 0.2, 0.75 + (i % 4 === 0 ? 0.2 : 0)]);
  for (let i = 0; i < 3; i++) out.push([bar(3) + beatsPerBar - 1 + i / 3, SNARE, 0.25, 0.7 + i * 0.12]);
  out.push([0, CRASH, 2, 0.9]);
  return out;
}

function genericBassSolo({ key, chords, beatsPerBar, rand }: SoloContext): Hit[] {
  const out: Hit[] = [];
  const seventh = 10; // the flat seventh: rock bass in any key
  chords.forEach((chord, bar) => {
    const root = near(chord.root, 38);
    const last = bar === chords.length - 1;
    const shapes = [
      [0, 0, 12, 0, 7, seventh, 12, 7],
      [0, 12, 7, 0, 0, 7, 12, 10],
    ];
    const shape = shapes[rand() < 0.5 ? 0 : 1]!;
    for (let i = 0; i < beatsPerBar * 2; i++) {
      const beat = bar * beatsPerBar + i / 2;
      if (last && i >= beatsPerBar) {
        // walk up the scale into the final chord
        const walk = scalePitches(key, key.minor ? MINOR_SCALE : MAJOR_SCALE, root, root + 12);
        out.push([beat, walk[Math.min(walk.length - 1, i - beatsPerBar + 1)]!, 0.45, 0.8]);
        continue;
      }
      out.push([beat, root + shape[i % shape.length]!, i % 2 === 0 ? 0.45 : 0.3, i % 2 === 0 ? 0.9 : 0.65]);
    }
  });
  return out;
}

function genericKeysSolo({ key, chords, beatsPerBar }: SoloContext): Hit[] {
  const out: Hit[] = [];
  chords.forEach((chord, bar) => {
    const tones = [0, chord.minor ? 3 : 4, 7];
    const low = near(chord.root, 60);
    // two octaves of chord tones, up then back down
    const up: number[] = [];
    for (let octave = 0; octave < 2; octave++) for (const t of tones) up.push(low + t + octave * 12);
    up.push(low + 24);
    const run = [...up, ...up.slice(1, -1).reverse()];
    const sixteenths = beatsPerBar * 4;
    if (bar === chords.length - 1 && chords.length > 1) {
      // a quick scale run up to the top
      const scale = scalePitches(key, key.minor ? MINOR_SCALE : MAJOR_SCALE, low, low + 26);
      for (let i = 0; i < sixteenths; i++) out.push([bar * beatsPerBar + i / 4, scale[Math.min(scale.length - 1, i)]!, 0.24, 0.75 + i * 0.015]);
      return;
    }
    for (let i = 0; i < sixteenths; i++) out.push([bar * beatsPerBar + i / 4, run[i % run.length]!, 0.24, i % 4 === 0 ? 0.95 : 0.8]);
  });
  return out;
}

function genericGuitarRuns({ key, chords, beatsPerBar }: SoloContext): Hit[] {
  const out: Hit[] = [];
  const scale = scalePitches(key, key.minor ? MINOR_SCALE : MAJOR_SCALE, 55, 84);
  const start = scale.findIndex((p) => p >= near(key.tonic, 64));
  const sixteenths = beatsPerBar * 4;
  chords.forEach((_, bar) => {
    for (let i = 0; i < sixteenths; i++) {
      const beat = bar * beatsPerBar + i / 4;
      if (bar === chords.length - 1 && i >= sixteenths / 2) {
        // land on the tonic and let it ring
        if (i === sixteenths / 2) out.push([beat, near(key.tonic, 76), beatsPerBar / 2, 0.9]);
        continue;
      }
      // groups of three up the scale (bars 1 and 3) or down it (bars 2 and 4)
      const group = Math.floor(i / 3);
      const step = (i % 3) + group;
      const index = bar % 2 === 0 ? start + step : start + 10 - step;
      out.push([beat, scale[Math.max(0, Math.min(scale.length - 1, index))]!, 0.25, i % 3 === 0 ? 1 : 0.85]);
    }
  });
  return out;
}

function genericLeadLick({ key, chords, beatsPerBar, rand }: SoloContext): Hit[] {
  const out: Hit[] = [];
  const scale = scalePitches(key, key.minor ? MINOR_PENTA : MAJOR_PENTA, 60, 91);
  /** the i-th note of the pentatonic scale, kept inside the guitar's range */
  const penta = (i: number) => scale[Math.max(0, Math.min(scale.length - 1, i))]!;
  let at = scale.findIndex((p) => p >= near(key.tonic, 67));
  const motif = rand() < 0.5 ? [0, 1, 2, 1] : [0, 2, 1, 2];
  chords.forEach((_, bar) => {
    const b0 = bar * beatsPerBar;
    if (bar === chords.length - 1) {
      // the climax: up to a long, high note
      out.push([b0, penta(at + 2), 0.5, 0.85], [b0 + 0.5, penta(at + 3), 0.5, 0.9], [b0 + 1, penta(at + 4), beatsPerBar - 1, 1]);
      return;
    }
    // the motif twice in eighths, then a held note: a bit higher every bar
    motif.forEach((step, i) => out.push([b0 + i * 0.5, penta(at + step), 0.45, i === 0 ? 0.95 : 0.75]));
    motif.forEach((step, i) => out.push([b0 + 2 + i * 0.5, penta(at + step), 0.45, i === 0 ? 0.9 : 0.7]));
    if (beatsPerBar > 4) out.push([b0 + 4, penta(at + 3), beatsPerBar - 4, 0.85]);
    at += 1;
  });
  return out;
}

// ---- built from the song: each member develops their own most played bar ----

/** Ritsu: her own groove, then with ghost notes, then its kicks under a tom run, then a fill. */
function drumSolo(c: SoloContext): Hit[] {
  const groove = c.groove;
  if (!groove) return genericDrumSolo(c);
  const { beatsPerBar, rand } = c;
  const bar = (b: number) => b * beatsPerBar;
  const out: Hit[] = [[0, CRASH, 2, 0.9]];
  // bar 1: exactly how she plays this song
  for (const h of groove) out.push([bar(0) + h.beat, h.pitch, 0.25, Math.min(1, h.velocity * 1.05)]);
  // bar 2: the same, with ghost notes on the snare in the gaps
  const taken = new Set(groove.map((h) => h.beat));
  for (const h of groove) out.push([bar(1) + h.beat, h.pitch, 0.25, Math.min(1, h.velocity * 1.1)]);
  for (let s = 0; s < beatsPerBar * 4; s++) if (!taken.has(s / 4) && rand() < 0.5) out.push([bar(1) + s / 4, SNARE, 0.2, 0.3]);
  // bar 3: her kicks and snares stay, everything else becomes a run down the toms
  const others = groove.filter((h) => !isKick(h.pitch) && !isSnare(h.pitch)).length || 1;
  let tom = 0;
  for (const h of groove) {
    if (isKick(h.pitch) || isSnare(h.pitch)) out.push([bar(2) + h.beat, h.pitch, 0.25, 0.9]);
    else out.push([bar(2) + h.beat, TOMS[Math.min(TOMS.length - 1, Math.floor((tom++ / others) * TOMS.length))]!, 0.25, 0.8]);
  }
  // bar 4: a snare fill over her kicks, getting louder, toms in triplets into the last beat
  const fill = (beatsPerBar - 1) * 4;
  for (const h of groove) if (isKick(h.pitch) && h.beat < beatsPerBar - 1) out.push([bar(3) + h.beat, KICK, 0.25, 0.9]);
  for (let s = 0; s < fill; s++) out.push([bar(3) + s / 4, SNARE, 0.2, 0.5 + (s / fill) * 0.4]);
  for (let i = 0; i < 3; i++) out.push([bar(3) + beatsPerBar - 1 + i / 3, TOMS[i * 2]!, 0.25, 0.8 + i * 0.07]);
  return out;
}

/** Mio: her own groove from the song on the solo chords, octave pops in bar 3, a walk up to end. */
function bassSolo(c: SoloContext): Hit[] {
  const figure = c.figure;
  if (!figure) return genericBassSolo(c);
  const { key, chords, beatsPerBar } = c;
  // her figure as intervals above the root of the chord it was played on
  const lowest = Math.min(...figure.notes.map((n) => n.pitch));
  const rootPc = figure.chord?.root ?? lowest % 12;
  const base = lowest - (((lowest - rootPc) % 12) + 12) % 12;
  const out: Hit[] = [];
  chords.forEach((chord, bar) => {
    const root = near(chord.root, 38);
    const b0 = bar * beatsPerBar;
    const last = bar === chords.length - 1;
    for (const n of figure.notes) {
      if (last && n.beat >= beatsPerBar / 2) break;
      let pitch = snap(root + (n.pitch - base), key);
      if (bar === 2 && n.beat % 1 !== 0) pitch += 12; // off-beat octave pops
      out.push([b0 + n.beat, inRange(pitch, 28, 55), n.beats, n.beat % 1 === 0 ? 0.9 : 0.75]);
    }
    if (last) {
      const walk = scalePitches(key, key.minor ? MINOR_SCALE : MAJOR_SCALE, root, root + 12);
      for (let i = 0; i < beatsPerBar; i++) out.push([b0 + beatsPerBar / 2 + i / 2, walk[Math.min(walk.length - 1, i + 1)]!, 0.45, 0.8]);
    }
  });
  return out;
}

/** Mugi: her own phrase in thirds, then the song's chord as an arpeggio, a run up to finish. */
function keysSolo(c: SoloContext): Hit[] {
  const figure = c.figure ?? c.melody;
  if (!figure) return genericKeysSolo(c);
  const { key, chords, beatsPerBar } = c;
  const out: Hit[] = [];
  chords.slice(0, 2).forEach((chord, bar) => {
    for (const n of placeFigure(figure, chord, key, 64, 88)) {
      out.push([bar * beatsPerBar + n.beat, n.pitch, n.beats, 0.85], [bar * beatsPerBar + n.beat, scaleStep(n.pitch, -2, key), n.beats, 0.65]);
    }
  });
  for (const [b, p, d, v] of genericKeysSolo({ ...c, chords: [chords[2]!] })) out.push([b + 2 * beatsPerBar, p, d, v]);
  // up the scale to an octave above where her phrase peaks
  const top = Math.max(...placeFigure(figure, chords[3]!, key, 64, 88).map((n) => n.pitch)) + 12;
  const scale = scalePitches(key, key.minor ? MINOR_SCALE : MAJOR_SCALE, top - 20, top);
  const steps = (beatsPerBar - 1) * 4;
  for (let i = 0; i < steps; i++) out.push([3 * beatsPerBar + i / 4, scale[Math.floor((i / steps) * scale.length)]!, 0.24, 0.75 + (i / steps) * 0.2]);
  out.push([4 * beatsPerBar - 1, snap(top, key), 1, 0.95]);
  return out;
}

/** Azusa: her own line, then the same line with fast runs between its notes, then up to the tonic. */
function guitarRuns(c: SoloContext): Hit[] {
  const figure = c.figure ?? c.melody;
  if (!figure) return genericGuitarRuns(c);
  const { key, chords, beatsPerBar } = c;
  const out: Hit[] = [];
  const line = (bar: number) => placeFigure(figure, chords[bar]!, key, 55, 84);
  // bar 1: as she plays it
  for (const n of line(0)) out.push([n.beat, n.pitch, n.beats, 0.95]);
  // bars 2 and 3: sixteenth runs along the scale from each note to the next (bar 3 an octave up)
  for (const bar of [1, 2]) {
    const notes = line(bar).map((n) => ({ ...n, pitch: bar === 2 ? inRange(n.pitch + 12, 55, 88) : n.pitch }));
    notes.forEach((n, i) => {
      const next = notes[i + 1];
      const end = next ? next.beat : beatsPerBar;
      let p = n.pitch;
      for (let t = n.beat; t < end - 1e-6; t += 0.25) {
        out.push([bar * beatsPerBar + t, p, 0.25, t === n.beat ? 1 : 0.85]);
        if (next && p !== next.pitch) p = scaleStep(p, Math.sign(next.pitch - p), key);
      }
    });
  }
  // bar 4: a fast climb to the tonic, held
  const tonic = inRange(near(key.tonic, 76), 64, 88);
  const climb = scalePitches(key, key.minor ? MINOR_SCALE : MAJOR_SCALE, tonic - 12, tonic);
  const steps = (beatsPerBar / 2) * 4;
  for (let i = 0; i < steps; i++) out.push([3 * beatsPerBar + i / 4, climb[Math.floor((i / steps) * climb.length)]!, 0.25, 0.85]);
  out.push([3 * beatsPerBar + beatsPerBar / 2, tonic, beatsPerBar / 2, 1]);
  return out;
}

/** Yui: her own hook, then a step higher, then twice as fast, then up to a long high note. */
function leadSolo(c: SoloContext): Hit[] {
  const figure = c.figure ?? c.melody;
  if (!figure) return genericLeadLick(c);
  const { key, chords, beatsPerBar } = c;
  const out: Hit[] = [];
  const hook = (bar: number) => placeFigure(figure, chords[bar]!, key, 60, 88);
  for (const n of hook(0)) out.push([n.beat, n.pitch, n.beats, 0.95]);
  for (const n of hook(1)) out.push([beatsPerBar + n.beat, scaleStep(n.pitch, 2, key), n.beats, 0.95]);
  // twice as fast, twice over (the second time a step up)
  for (const half of [0, 1]) {
    for (const n of hook(2)) {
      out.push([2 * beatsPerBar + half * (beatsPerBar / 2) + n.beat / 2, scaleStep(n.pitch, half, key), n.beats / 2, 0.9]);
    }
  }
  // the hook's first half, then a long note above its peak
  const last = hook(3);
  for (const n of last) {
    if (n.beat < beatsPerBar / 2) out.push([3 * beatsPerBar + n.beat, n.pitch, Math.min(n.beats, beatsPerBar / 2 - n.beat), 0.95]);
  }
  const peak = Math.max(...last.map((n) => n.pitch));
  const chord = chords[3]!;
  const high = [0, chord.minor ? 3 : 4, 7, 12].map((t) => near((chord.root + t) % 12, peak + 4)).find((p) => p > peak) ?? scaleStep(peak, 2, key);
  out.push([3 * beatsPerBar + beatsPerBar / 2, inRange(high, 64, 91), beatsPerBar / 2, 1]);
  return out;
}

const SOLO_FOR: Record<InstrumentId, (c: SoloContext) => Hit[]> = {
  drums: drumSolo,
  bass: bassSolo,
  keys: keysSolo,
  "rhythm-guitar": guitarRuns,
  "lead-guitar": leadSolo,
};

/**
 * Ritsu's beat under someone else's solo: under a bass solo a soft kick-and-snare groove;
 * under keys and guitars just the hi-hat and a kick on the bar, so the solo stays on top.
 */
function backingBeat(beatsPerBar: number, bars: number, light: boolean): Hit[] {
  const out: Hit[] = [];
  for (let beat = 0; beat < bars * beatsPerBar; beat++) {
    if (!light) out.push([beat, beat % 2 === 0 ? KICK : SNARE, 0.25, 0.35]);
    else if (beat % beatsPerBar === 0) out.push([beat, KICK, 0.25, 0.4]);
    out.push([beat, HAT, 0.25, 0.22], [beat + 0.5, HAT, 0.25, 0.15]);
  }
  return out;
}

/** Mio's roots under someone else's solo: one long, soft note a bar. */
function backingRoots(chords: Chord[], beatsPerBar: number): Hit[] {
  return chords.map((chord, bar): Hit => [bar * beatsPerBar, near(chord.root, 38), beatsPerBar - 0.1, 0.32]);
}

/** Everyone together on the tonic chord: the band's bow. */
function finalHit(instrument: InstrumentId, key: Key): Hit[] {
  const third = key.minor ? 3 : 4;
  switch (instrument) {
    case "drums":
      return [
        [0, KICK, 1, 1],
        [0, CRASH, 3, 1],
      ];
    case "bass":
      return [[0, near(key.tonic, 33), 2.5, 1]];
    case "keys":
      return [0, third, 7, 12].map((t): Hit => [0, near(key.tonic, 60) + t, 3, 0.85]);
    case "rhythm-guitar":
    case "lead-guitar":
      return [0, 7, 12].map((t): Hit => [0, near(key.tonic, 45) + t, 3, 0.95]);
  }
}

/**
 * The solo round for a song: notes per member, starting at `start` (song seconds; the
 * song's end, on a bar line), at the song's base tempo and bar length.
 */
export function soloRound(tracks: readonly SoloTrack[], baseBpm: number, beatsPerBar: number, start: number, seed: string): SoloRound {
  const harmonic = tracks.filter((t) => t.instrument !== "drums");
  const key = detectKey(harmonic.flatMap((t) => [...t.notes, ...(t.vocal ?? [])]));
  const beat = 60 / baseBpm;
  // the song's own material: its chords bar by bar, its most played progression, its tune
  const grid = { beat, beatsPerBar };
  const songBars = Math.max(1, Math.round(start / (beat * beatsPerBar)));
  const songChords = barChords(harmonic.map((t) => t.notes), grid, songBars);
  const chords = commonProgression(songChords, 4, key) ?? progression(key);
  const singer = tracks.find((t) => t.memberId === "yui" && t.vocal?.length) ?? tracks.find((t) => t.vocal?.length);
  const yui = tracks.find((t) => t.memberId === "yui");
  const melody =
    (singer?.vocal ? signatureFigure(singer.vocal, grid, songChords) : null) ??
    (yui ? signatureFigure(yui.notes, grid, songChords) : null);
  const partOf = new Map(tracks.map((t) => [t.memberId, t]));

  const notes = Object.fromEntries(tracks.map((t) => [t.memberId, [] as NoteEvent[]])) as Record<MemberId, NoteEvent[]>;
  const instrumentOf = new Map(tracks.map((t) => [t.memberId, t.instrument]));
  const put = (member: MemberId, fromBeat: number, hits: Hit[]) => {
    for (const [b, pitch, beats, velocity] of hits) {
      notes[member]?.push({
        pitch: Math.max(0, Math.min(127, pitch)),
        start: start + (fromBeat + b) * beat,
        duration: beats * beat,
        velocity: Math.min(1, velocity),
      });
    }
  };

  const spots: SoloSpot[] = [];
  SOLO_ORDER.filter((m) => instrumentOf.has(m)).forEach((member, i) => {
    const from = i * SOLO_BARS * beatsPerBar;
    const instrument = instrumentOf.get(member)!;
    const own = partOf.get(member)!.notes;
    const figure = instrument === "drums" ? null : signatureFigure(own, grid, songChords, instrument === "bass" ? 2 : 3);
    const groove = instrument === "drums" ? signatureGroove(own, grid) : null;
    const rand = random(`${seed}|${member}`);
    put(member, from, SOLO_FOR[instrument]({ key, chords, beatsPerBar, rand, figure, melody, groove }));
    if (instrument !== "drums") {
      // the rhythm section keeps going underneath (unless it is the soloist)
      for (const [m, inst] of instrumentOf) {
        if (m === member) continue;
        if (inst === "drums") put(m, from, backingBeat(beatsPerBar, SOLO_BARS, instrument !== "bass"));
        else if (inst === "bass" && instrument !== "bass") put(m, from, backingRoots(chords, beatsPerBar));
      }
    }
    spots.push({ member, start: start + from * beat, end: start + (from + SOLO_BARS * beatsPerBar) * beat });
  });

  const endBeat = spots.length * SOLO_BARS * beatsPerBar;
  for (const [member, instrument] of instrumentOf) put(member, endBeat, finalHit(instrument, key));
  for (const list of Object.values(notes)) list.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  // the final chord rings 3 beats: as many whole bars as that takes (one, unless bars are short)
  const tailBeats = Math.ceil(3 / beatsPerBar) * beatsPerBar;
  return { notes, spots, end: start + (endBeat + tailBeats) * beat };
}
