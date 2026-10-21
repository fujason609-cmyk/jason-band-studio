import type { MemberId } from "@/features/band/types";
import type { InstrumentId } from "@/types/audio";
import type { NoteEvent } from "@/types/midi";

/**
 * The solo round: after the song, every member takes a 4-bar solo in turn (Ritsu, Mio,
 * Mugi, Azusa, then Yui to close) and the band ends together on one big chord. Written
 * here, note by note, in the song's own key and tempo, for whatever instrument each
 * member is playing, and in their character:
 *
 *   drums          Ritsu: a groove that gets busier, snare rolls, a tom run, a crash
 *   bass           Mio: a steady groove of roots, octaves and fifths, a walk up at the end
 *   keys           Mugi: classical arpeggios up and down the chords, a scale run to finish
 *   rhythm guitar  Azusa: clean, fast scale runs in threes
 *   lead guitar    Yui: one catchy little motif, climbing, ending on a long high note
 *
 * While someone solos, Ritsu keeps a soft beat and Mio plays the roots underneath, quietly
 * (velocities set so the soloist is clearly on top; a drum solo plays alone). Pure and deterministic: the same song always gets the same solos.
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

interface Chord {
  /** pitch class */
  root: number;
  minor: boolean;
}

/** The round's progression, one chord a bar: I V vi IV in a major key, i VI III VII in a minor one. */
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

type Hit = [beat: number, pitch: number, beats: number, velocity: number];

interface SoloContext {
  key: Key;
  chords: Chord[];
  beatsPerBar: number;
  rand: () => number;
}

const KICK = 36;
const SNARE = 38;
const HAT = 42;
const CRASH = 49;
const TOMS = [50, 48, 47, 45, 43, 41];

function drumSolo({ beatsPerBar, rand }: SoloContext): Hit[] {
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

function bassSolo({ key, chords, beatsPerBar, rand }: SoloContext): Hit[] {
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

function keysSolo({ key, chords, beatsPerBar }: SoloContext): Hit[] {
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
    if (bar === chords.length - 1) {
      // a quick scale run up to the top
      const scale = scalePitches(key, key.minor ? MINOR_SCALE : MAJOR_SCALE, low, low + 26);
      for (let i = 0; i < sixteenths; i++) out.push([bar * beatsPerBar + i / 4, scale[Math.min(scale.length - 1, i)]!, 0.24, 0.75 + i * 0.015]);
      return;
    }
    for (let i = 0; i < sixteenths; i++) out.push([bar * beatsPerBar + i / 4, run[i % run.length]!, 0.24, i % 4 === 0 ? 0.95 : 0.8]);
  });
  return out;
}

function guitarRuns({ key, chords, beatsPerBar }: SoloContext): Hit[] {
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

function leadLick({ key, chords, beatsPerBar, rand }: SoloContext): Hit[] {
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

const SOLO_FOR: Record<InstrumentId, (c: SoloContext) => Hit[]> = {
  drums: drumSolo,
  bass: bassSolo,
  keys: keysSolo,
  "rhythm-guitar": guitarRuns,
  "lead-guitar": leadLick,
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
  const key = detectKey(tracks.filter((t) => t.instrument !== "drums").flatMap((t) => t.notes));
  const chords = progression(key);
  const beat = 60 / baseBpm;
  const spotBeats = SOLO_BARS * beatsPerBar;
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
    const from = i * spotBeats;
    const instrument = instrumentOf.get(member)!;
    const rand = random(`${seed}|${member}`);
    put(member, from, SOLO_FOR[instrument]({ key, chords, beatsPerBar, rand }));
    if (instrument !== "drums") {
      // the rhythm section keeps going underneath (unless it is the soloist)
      for (const [m, inst] of instrumentOf) {
        if (m === member) continue;
        if (inst === "drums") put(m, from, backingBeat(beatsPerBar, SOLO_BARS, instrument !== "bass"));
        else if (inst === "bass" && instrument !== "bass") put(m, from, backingRoots(chords, beatsPerBar));
      }
    }
    spots.push({ member, start: start + from * beat, end: start + (from + spotBeats) * beat });
  });

  const endBeat = spots.length * spotBeats;
  for (const [member, instrument] of instrumentOf) put(member, endBeat, finalHit(instrument, key));
  for (const list of Object.values(notes)) list.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  return { notes, spots, end: start + (endBeat + beatsPerBar) * beat };
}
