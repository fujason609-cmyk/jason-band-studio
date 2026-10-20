import type { InstrumentId } from "@/types/audio";

/**
 * Playing style: the same score, played the way a band would play it in another genre.
 * Pure note maths on Transport ticks; AudioTrack arranges the written notes with it
 * before the feel and the strums, and voices.ts sets the guitar amps per style. The
 * score on screen never changes.
 *
 *   rock    power chords chugged in eighths on rhythm guitar, eighth-note bass,
 *           harder drums with a crash at the top of every 4-bar phrase, more amp drive
 *   punk    rock pushed further: anything longer than an eighth is down-picked in
 *           eighths, a crash every 2 bars, the most drive
 *   ballad  softer and legato; guitars pick held chords as arpeggios, clean amps, quiet drums
 *   swing   off-beat eighths fall late, on the last triplet; clean, dark jazz guitar
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
}

const CRASHES = new Set([49, 57]);
const SNARES = new Set([38, 40]);
/** lowest root of a power chord: the guitar's low E */
const LOW_E = 40;

const clampVelocity = (v: number) => Math.min(1, Math.max(0.05, v));

function louder(notes: readonly StyledNote[], scale: number): StyledNote[] {
  return notes.map((n) => ({ ...n, velocity: clampVelocity(n.velocity * scale) }));
}

function byStart(notes: readonly StyledNote[]): StyledNote[][] {
  const groups = new Map<number, StyledNote[]>();
  for (const n of notes) {
    const group = groups.get(n.ticks);
    if (group) group.push(n);
    else groups.set(n.ticks, [n]);
  }
  return [...groups.values()];
}

/** Every chord (or single note) becomes root + fifth + octave, root on the low strings. */
export function powerChords(notes: readonly StyledNote[]): StyledNote[] {
  return byStart(notes).flatMap((group) => {
    let root = Math.min(...group.map((n) => n.pitch));
    while (root >= LOW_E + 12) root -= 12;
    while (root < LOW_E) root += 12;
    const durationTicks = Math.max(...group.map((n) => n.durationTicks));
    const velocity = Math.max(...group.map((n) => n.velocity));
    const { ticks } = group[0]!;
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
    const count = Math.max(1, Math.round(n.durationTicks / eighth));
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

/** Snare on beats 2 and 4 hit harder. */
function backbeat(notes: readonly StyledNote[], ppq: number): StyledNote[] {
  return notes.map((n) =>
    SNARES.has(n.pitch) && n.ticks % (ppq * 2) === ppq ? { ...n, velocity: clampVelocity(n.velocity + 0.12) } : n,
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
    if (CRASHES.has(n.pitch)) starts.delete(Math.round(n.ticks / phrase) * phrase);
  }
  const added = [...starts].map((ticks) => ({ ticks, durationTicks: ppq, pitch: 49, velocity: 0.8 }));
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
  return byStart(notes).flatMap((group) => {
    const shortest = Math.min(...group.map((n) => n.durationTicks));
    if (group.length < 3 || shortest < ppq) return group;
    const lastStep = Math.max(0, Math.floor((shortest - 1) / eighth) - 1);
    return [...group]
      .sort((a, b) => a.pitch - b.pitch)
      .map((n, i) => {
        const offset = Math.min(i, lastStep) * eighth;
        return { ...n, ticks: n.ticks + offset, durationTicks: n.durationTicks - offset };
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

function rock(instrument: InstrumentId, notes: readonly StyledNote[], ppq: number, beatsPerBar: number, punk: boolean) {
  // punk down-picks anything longer than an eighth; rock only notes a beat or longer
  const chugFrom = punk ? ppq * 0.75 : ppq;
  switch (instrument) {
    case "rhythm-guitar":
      return chug(powerChords(louder(notes, 1.05)), ppq, chugFrom);
    case "bass":
      return chug(louder(notes, 1.05), ppq, chugFrom);
    case "lead-guitar":
      return louder(notes, punk ? 1.15 : 1.1);
    case "drums":
      return phraseCrashes(backbeat(louder(notes, punk ? 1.2 : 1.12), ppq), ppq, beatsPerBar, punk ? 2 : 4);
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

/** The notes `instrument` actually plays for the written `notes` in `style`. */
export function arrange(
  style: PlayStyle,
  instrument: InstrumentId,
  notes: readonly StyledNote[],
  ppq: number,
  beatsPerBar: number,
): readonly StyledNote[] {
  switch (style) {
    case "original":
      return notes;
    case "rock":
    case "punk":
      return rock(instrument, notes, ppq, beatsPerBar, style === "punk");
    case "ballad":
      return ballad(instrument, notes, ppq);
    case "swing":
      return swing(louder(notes, instrument === "drums" ? 0.8 : 0.9), ppq);
  }
}
