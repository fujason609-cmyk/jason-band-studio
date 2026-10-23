import type { InstrumentId } from "@/types/audio";
import type { BendPoint } from "@/types/midi";

/**
 * Playing style: the same score, played the way a band would play it in another genre.
 * Pure note maths on Transport ticks; AudioTrack arranges the written notes with it
 * before the feel and the strums, and voices.ts sets the guitar amps per style. The
 * score on screen never changes.
 *
 *   rock    power chords chugged in eighths on rhythm guitar, eighth-note bass,
 *           harder drums with a crash at the top of every 4-bar phrase, more amp drive
 *   punk    rock pushed further: harder, a kick on every beat of a generated groove,
 *           a crash every 2 bars, the most drive
 *   ballad  softer and legato; guitars pick held chords as arpeggios, clean amps, quiet drums
 *   swing   off-beat eighths fall late, on the last triplet; clean, dark jazz guitar
 *
 * In rock and punk, a score with no drum part can get a generated groove (`autoDrums`)
 * in every bar where the rest of the band plays.
 */
export type PlayStyle = "original" | "rock" | "punk" | "ballad" | "swing";

export const PLAY_STYLES: PlayStyle[] = ["original", "rock", "punk", "ballad", "swing"];

export function isPlayStyle(value: unknown): value is PlayStyle {
  return typeof value === "string" && (PLAY_STYLES as string[]).includes(value);
}

export interface StyledNote {
  /** start in Transport ticks */
  ticks: number;
  durationTicks: number;
  pitch: number;
  velocity: number;
  /** the written note's bend (song seconds after its start); notes a style adds have none */
  bend?: readonly BendPoint[];
}

const CRASHES = new Set([49, 57]);
const SNARES = new Set([38, 40]);
/** lowest root of a power chord: the guitar's low E */
const LOW_E = 40;

const clampVelocity = (v: number) => Math.min(1, Math.max(0.05, v));

function louder(notes: readonly StyledNote[], scale: number): StyledNote[] {
  return notes.map((n) => ({ ...n, velocity: clampVelocity(n.velocity * scale) }));
}

/**
 * Chords: notes starting together, in time order. Notes up to `CHORD_SPREAD` of a beat
 * after a group's first note still belong to it (humanized MIDI and Guitar Pro brush
 * strokes spread a chord over a few ticks).
 */
const CHORD_SPREAD = 1 / 16;

function byStart(notes: readonly StyledNote[], ppq: number): StyledNote[][] {
  const sorted = [...notes].sort((a, b) => a.ticks - b.ticks);
  const groups: StyledNote[][] = [];
  for (const n of sorted) {
    const group = groups[groups.length - 1];
    if (group && n.ticks - group[0]!.ticks <= ppq * CHORD_SPREAD) group.push(n);
    else groups.push([n]);
  }
  return groups;
}

/**
 * Every chord (or single note) becomes root + fifth + octave, root on the low strings.
 * A power chord stops where the next one starts, as a guitarist's would, so a held chord
 * under moving notes never doubles them.
 */
export function powerChords(notes: readonly StyledNote[], ppq: number): StyledNote[] {
  const groups = byStart(notes, ppq);
  return groups.flatMap((group, g) => {
    let root = Math.min(...group.map((n) => n.pitch));
    while (root >= LOW_E + 12) root -= 12;
    while (root < LOW_E) root += 12;
    const { ticks } = group[0]!;
    const next = groups[g + 1]?.[0]!.ticks ?? Infinity;
    const durationTicks = Math.max(1, Math.min(next - ticks, Math.max(...group.map((n) => n.durationTicks))));
    const velocity = Math.max(...group.map((n) => n.velocity));
    return [0, 7, 12].map((step) => ({ ticks, durationTicks, pitch: root + step, velocity }));
  });
}

/**
 * Notes at least `fromTicks` long are re-picked as palm-muted eighths for as long as
 * they last; beats are dug in, off-beats a little lighter.
 */
export function chug(notes: readonly StyledNote[], ppq: number, fromTicks: number): StyledNote[] {
  const eighth = ppq / 2;
  return notes.flatMap((n) => {
    if (n.durationTicks < fromTicks) return [n];
    // whole eighths only (a dotted eighth is one hit, not two); a little slack for notes
    // converted from seconds that come out a tick short
    const count = Math.max(1, Math.floor(n.durationTicks / eighth + 0.125));
    return Array.from({ length: count }, (_, i) => {
      const ticks = n.ticks + i * eighth;
      const onBeat = ticks % ppq === 0;
      return {
        ticks,
        durationTicks: Math.round(eighth * 0.8),
        pitch: n.pitch,
        velocity: clampVelocity(n.velocity + (onBeat ? 0.08 : -0.06)),
      };
    });
  });
}

/** Snare on the bar's even beats (2 and 4 in 4/4, 2 in 3/4) hit harder. */
function backbeat(notes: readonly StyledNote[], ppq: number, beatsPerBar: number): StyledNote[] {
  const bar = ppq * beatsPerBar;
  return notes.map((n) =>
    SNARES.has(n.pitch) && (n.ticks % bar) % (ppq * 2) === ppq ? { ...n, velocity: clampVelocity(n.velocity + 0.12) } : n,
  );
}

/** A crash on the downbeat of every `everyBars`-bar phrase where the drums are playing. */
export function phraseCrashes(notes: readonly StyledNote[], ppq: number, beatsPerBar: number, everyBars: number): StyledNote[] {
  const phrase = ppq * beatsPerBar * everyBars;
  const window = ppq / 4;
  const starts = new Set<number>();
  for (const n of notes) {
    const start = Math.round(n.ticks / phrase) * phrase;
    if (Math.abs(n.ticks - start) <= window) starts.add(start);
  }
  for (const n of notes) {
    // a crash already written there (one elsewhere in the phrase doesn't count)
    const start = Math.round(n.ticks / phrase) * phrase;
    if (CRASHES.has(n.pitch) && Math.abs(n.ticks - start) <= window) starts.delete(start);
  }
  const added = [...starts].map((ticks) => ({ ticks, durationTicks: ppq, pitch: CRASH, velocity: 0.8 }));
  return [...notes, ...added];
}

/** Notes ring on to the next note (by up to a beat more than written), so lines join up. */
export function legato(notes: readonly StyledNote[], ppq: number): StyledNote[] {
  const starts = [...new Set(notes.map((n) => n.ticks))].sort((a, b) => a - b);
  return notes.map((n) => {
    // first start after this note's own
    let lo = 0;
    let hi = starts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid]! <= n.ticks) lo = mid + 1;
      else hi = mid;
    }
    const next = starts[lo];
    if (next === undefined || next - n.ticks <= n.durationTicks) return n;
    return { ...n, durationTicks: Math.min(next - n.ticks, n.durationTicks + ppq) };
  });
}

/**
 * Held chords (three notes or more, a beat or longer) are picked one string at a time,
 * low to high, an eighth apart, all ringing to the chord's end.
 */
export function arpeggiate(notes: readonly StyledNote[], ppq: number): StyledNote[] {
  const eighth = ppq / 2;
  return byStart(notes, ppq).flatMap((group) => {
    const shortest = Math.min(...group.map((n) => n.durationTicks));
    if (group.length < 3 || shortest < ppq) return group;
    // the last string starts at least an eighth before the chord ends (a beat: one step)
    const lastStep = Math.max(1, Math.floor((shortest - 1) / eighth) - 1);
    const start = group[0]!.ticks;
    return [...group]
      .sort((a, b) => a.pitch - b.pitch)
      .map((n, i) => {
        const ticks = start + Math.min(i, lastStep) * eighth;
        const moved = { ...n, ticks, durationTicks: Math.max(1, n.ticks + n.durationTicks - ticks) };
        // a bend counts from the chord's start: a string picked later can't keep it
        if (ticks !== n.ticks) delete moved.bend;
        return moved;
      });
  });
}

/** Swing time: inside each beat the first eighth stretches to 2/3 and the second shrinks to 1/3. */
export function swingTicks(ticks: number, ppq: number): number {
  const beat = Math.floor(ticks / ppq) * ppq;
  const p = ticks - beat;
  const half = ppq / 2;
  const swung = p < half ? (p * 4) / 3 : (ppq * 2) / 3 + ((p - half) * 2) / 3;
  return Math.round(beat + swung);
}

export function swing(notes: readonly StyledNote[], ppq: number): StyledNote[] {
  return notes.map((n) => {
    const ticks = swingTicks(n.ticks, ppq);
    const end = swingTicks(n.ticks + n.durationTicks, ppq);
    return { ...n, ticks, durationTicks: Math.max(1, end - ticks) };
  });
}

/** What a part needs to know about the rest of the band. */
export interface BandContext {
  /** generate drums when the drum part is empty (rock and punk only) */
  autoDrums: boolean;
  /** bars (0-based) where any other part has a note, sorted */
  playedBars: readonly number[];
  /**
   * where the written song ends, when a solo round follows it: only drum notes before it
   * count as the song's drum part (Ritsu's solo after it doesn't). Infinity when absent.
   */
  songEndTicks?: number;
}

/** Whether a drums part with no notes plays the generated groove (`autoDrums`, rock and punk only). */
export function drumsGenerated(style: PlayStyle, autoDrums: boolean): boolean {
  return autoDrums && (style === "rock" || style === "punk");
}

export const NO_BAND: BandContext = { autoDrums: false, playedBars: [] };

const KICK = 36;
const SNARE = 38;
const CLOSED_HAT = 42;
const CRASH = 49;

/**
 * Bars (0-based, sorted) that have a sounding note: a held chord counts for every bar it
 * rings through.
 */
export function playedBars(notes: Iterable<{ ticks: number; durationTicks: number }>, barTicks: number): number[] {
  const bars = new Set<number>();
  for (const n of notes) {
    const last = Math.floor((n.ticks + Math.max(1, n.durationTicks) - 1) / barTicks);
    for (let bar = Math.floor(n.ticks / barTicks); bar <= last; bar++) bars.add(bar);
  }
  return [...bars].sort((a, b) => a - b);
}

/**
 * A basic beat for each played bar. Hi-hat eighths, kick on the odd beats and snare on the
 * even ones (rock adds a kick on the "and" of 3; punk kicks every beat), a crash at the
 * top of each phrase (4 bars, punk 2) and a snare fill into the next phrase.
 */
export function drumGroove(bars: readonly number[], ppq: number, beatsPerBar: number, punk: boolean): StyledNote[] {
  const barTicks = ppq * beatsPerBar;
  const eighth = ppq / 2;
  const sixteenth = ppq / 4;
  const played = new Set(bars);
  const hit = (ticks: number, pitch: number, velocity: number, durationTicks = eighth): StyledNote => ({
    ticks,
    durationTicks,
    pitch,
    velocity,
  });
  const out: StyledNote[] = [];
  for (const bar of bars) {
    const start = bar * barTicks;
    const crashHere = bar % (punk ? 2 : 4) === 0 || !played.has(bar - 1);
    const fillHere = bar % 4 === 3 && played.has(bar + 1) && beatsPerBar >= 3;
    for (let beat = 0; beat < beatsPerBar; beat++) {
      const t = start + beat * ppq;
      const lastBeat = beat === beatsPerBar - 1;
      if (fillHere && lastBeat) {
        // four sixteenths on the snare, getting louder, into the next phrase
        for (let i = 0; i < 4; i++) out.push(hit(t + i * sixteenth, SNARE, 0.55 + i * 0.12, sixteenth));
        if (!punk) out.push(hit(t, KICK, 0.8));
        continue;
      }
      if (beat === 0 && crashHere) out.push(hit(t, CRASH, 0.85, ppq * 2));
      else out.push(hit(t, CLOSED_HAT, punk ? 0.75 : 0.68));
      out.push(hit(t + eighth, CLOSED_HAT, punk ? 0.6 : 0.5));
      if (beat % 2 === 0 || punk) out.push(hit(t, KICK, beat === 0 ? 0.95 : 0.85));
      if (beat % 2 === 1) out.push(hit(t, SNARE, 0.9));
      if (!punk && beatsPerBar === 4 && beat === 2) out.push(hit(t + eighth, KICK, 0.7));
    }
  }
  return out;
}

function rock(
  instrument: InstrumentId,
  notes: readonly StyledNote[],
  ppq: number,
  beatsPerBar: number,
  punk: boolean,
  band: BandContext,
) {
  // notes a beat or longer are re-picked in whole eighths (a dotted eighth stays one hit:
  // a second one would land off the grid, between it and the next note)
  const chugFrom = ppq;
  switch (instrument) {
    case "rhythm-guitar":
      return chug(powerChords(louder(notes, 1.05), ppq), ppq, chugFrom);
    case "bass":
      return chug(louder(notes, 1.05), ppq, chugFrom);
    case "lead-guitar":
      return louder(notes, punk ? 1.15 : 1.1);
    case "drums": {
      const harder = (part: readonly StyledNote[]) =>
        phraseCrashes(backbeat(louder(part, punk ? 1.2 : 1.12), ppq, beatsPerBar), ppq, beatsPerBar, punk ? 2 : 4);
      const songEnd = band.songEndTicks ?? Infinity;
      if (!band.autoDrums || notes.some((n) => n.ticks < songEnd)) return harder(notes);
      // the song has no drums: a groove for it, and the solo round's drums as written
      return [...drumGroove(band.playedBars, ppq, beatsPerBar, punk), ...(notes.length > 0 ? harder(notes) : [])];
    }
    case "keys":
      return louder(notes, punk ? 1.1 : 1.05);
  }
}

function ballad(instrument: InstrumentId, notes: readonly StyledNote[], ppq: number) {
  switch (instrument) {
    case "drums":
      return louder(notes, 0.55);
    case "lead-guitar":
    case "rhythm-guitar":
      return arpeggiate(legato(louder(notes, 0.78), ppq), ppq);
    case "bass":
    case "keys":
      return legato(louder(notes, 0.8), ppq);
  }
}

/**
 * A sung part in `style`: the tune stays as written (no chugs or power chords), but it
 * gets louder in rock and punk, joins up in a ballad and swings in swing.
 */
export function arrangeVocal(style: PlayStyle, notes: readonly StyledNote[], ppq: number): readonly StyledNote[] {
  switch (style) {
    case "original":
      return notes;
    case "rock":
    case "punk":
      return louder(notes, style === "punk" ? 1.1 : 1.05);
    case "ballad":
      return legato(louder(notes, 0.85), ppq);
    case "swing":
      return swing(notes, ppq);
  }
}

/** The notes `instrument` actually plays for the written `notes` in `style`. */
export function arrange(
  style: PlayStyle,
  instrument: InstrumentId,
  notes: readonly StyledNote[],
  ppq: number,
  beatsPerBar: number,
  band: BandContext = NO_BAND,
): readonly StyledNote[] {
  switch (style) {
    case "original":
      return notes;
    case "rock":
    case "punk":
      return rock(instrument, notes, ppq, beatsPerBar, style === "punk", band);
    case "ballad":
      return ballad(instrument, notes, ppq);
    case "swing":
      return swing(louder(notes, instrument === "drums" ? 0.8 : 0.9), ppq);
  }
}
