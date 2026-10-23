import { Midi } from "@tonejs/midi";
import type { BendPoint, NoteEvent, ParsedMidi, ParsedMidiTrack } from "@/types/midi";

export type MidiParseErrorCode = "unreadable" | "no-notes";

export class MidiParseError extends Error {
  constructor(
    readonly code: MidiParseErrorCode,
    readonly fileName: string,
    message: string,
  ) {
    super(message);
    this.name = "MidiParseError";
  }
}

/**
 * MIDI text is bytes; the MIDI reader gives one character per byte. Most files today write
 * UTF-8 (and score imports always do), so decode it as that, and keep the bytes as they
 * are when they aren't UTF-8.
 */
export function decodeMidiText(text: string): string {
  if (![...text].some((c) => c.charCodeAt(0) >= 0x80)) return text;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(text, (c) => c.charCodeAt(0)));
  } catch {
    return text;
  }
}

type ReaderTrack = Midi["tracks"][number];

/** The parts of a file as they were written: what the MIDI reader split apart, put back. */
interface Part {
  /** the reader's index of the part's first piece */
  index: number;
  name: string;
  first: ReaderTrack;
  pieces: ReaderTrack[];
}

/**
 * The MIDI reader splits a track at every program change, so one part can come out as
 * several pieces, and only the first keeps the track's name:
 *   - a track that sets volume and pan before choosing its instrument leaves its name on a
 *     piece with controllers but no notes (its channel reads as 0, the reader takes it from
 *     notes): the notes after it get that name back
 *   - an instrument change mid-song (a guitar switching patch, a drum kit change) carries on
 *     on the same channel without a name: it is joined back onto the part
 *   - in a format 1 file an unnamed piece of the same MIDI track (`chunkOf`, from
 *     `channelEvents`) is joined when it is the same part: settings with no notes, a patch
 *     change on the same channel, or the same instrument on another channel (a score part's
 *     bent notes, on its second channel, scoreToMidi). Never drums with pitched notes: a MIDI
 *     track can hold a piano on channel 0 and drums on 9, two parts. (In a format 0 file
 *     `chunkOf` says nothing: its one MIDI track holds every part.)
 * Names are decoded before they are trimmed: trim() would cut a UTF-8 byte 0xA0 (the end
 * of "ム" in ドラム) off the raw text.
 */
function partsOf(tracks: readonly ReaderTrack[], chunkOf: (track: ReaderTrack) => number): Part[] {
  const parts: Part[] = [];
  tracks.forEach((track, index) => {
    const name = decodeMidiText(track.name).trim();
    const before = tracks[index - 1];
    const last = parts[parts.length - 1];
    const chunk = chunkOf(track);
    if (!name && last && chunk >= 0) {
      const kin = last.pieces.filter((p) => chunkOf(p) === chunk);
      const drums = (t: ReaderTrack) => t.instrument.percussion || t.channel === 9;
      const samePart =
        kin.length > 0 &&
        (track.notes.length === 0 ||
          kin.some(
            (p) =>
              p.notes.length > 0 &&
              drums(p) === drums(track) &&
              (p.channel === track.channel || p.instrument.number === track.instrument.number),
          ));
      if (samePart) {
        last.pieces.push(track);
        return;
      }
    }
    if (!name && before && last) {
      const settingsPiece = before.notes.length === 0 && Object.keys(before.controlChanges).length > 0 && last.name;
      if (settingsPiece) {
        parts.push({ index, name: last.name, first: track, pieces: [track] });
        return;
      }
      if (before.notes.length > 0 && before.channel === track.channel && last.pieces.includes(before)) {
        last.pieces.push(track);
        return;
      }
    }
    parts.push({ index, name, first: track, pieces: [track] });
  });
  return parts;
}

/**
 * What the MIDI reader leaves out: which MIDI track and channel each of its tracks came from,
 * and the pitch bends by channel. The reader (@tonejs/midi over midi-file) splits every MIDI
 * track into one piece per instrument and channel, in the order they first appear (the first
 * sharing the track's own events), and in a format 1 file drops the first piece when it has
 * no notes; running status carries on over meta and sysex events. This scan follows the same
 * rules, so its `pieces` line up with the reader's tracks (parseMidi checks that they do).
 */
export function channelEvents(data: ArrayBuffer | Uint8Array) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const pieces: { chunk: number; channel: number; notes: boolean }[] = [];
  const bends: Map<number, { tick: number; value: number }[]>[] = [];
  let at = 8 + ((bytes[4]! << 24) | (bytes[5]! << 16) | (bytes[6]! << 8) | bytes[7]!);
  while (at + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
    const length = ((bytes[at + 4]! << 24) | (bytes[at + 5]! << 16) | (bytes[at + 6]! << 8) | bytes[at + 7]!) >>> 0;
    const end = Math.min(bytes.length, at + 8 + length);
    let p = at + 8;
    at = end;
    if (id !== "MTrk") continue;
    const chunk = bends.length;
    const channelBends = new Map<number, { tick: number; value: number }[]>();
    bends.push(channelBends);
    const program = Array<number>(16).fill(0);
    // "program channel" → its piece, in the order they appear
    const keys = new Map<string, { chunk: number; channel: number; notes: boolean }>();
    let events = 0;
    const varLength = () => {
      let v = 0;
      for (let i = 0; i < 4 && p < end; i++) {
        const b = bytes[p++]!;
        v = (v << 7) | (b & 0x7f);
        if (b < 0x80) break;
      }
      return v;
    };
    let tick = 0;
    let running = 0; // the last channel status (meta and sysex leave it, as midi-file does)
    while (p < end) {
      tick += varLength();
      let status = bytes[p]!;
      if (status >= 0x80) p++;
      else status = running;
      events += 1;
      if (status === 0xff) {
        p += 1; // meta type
        const skip = varLength(); // (not `p += varLength()`: that reads p before the call moves it)
        p += skip;
      } else if (status === 0xf0 || status === 0xf7) {
        const skip = varLength();
        p += skip;
      } else if (status >= 0x80) {
        running = status;
        const kind = status & 0xf0;
        const channel = status & 0x0f;
        const a = bytes[p++]!;
        const b = kind === 0xc0 || kind === 0xd0 ? 0 : bytes[p++]!;
        if (kind === 0xc0) program[channel] = a;
        const key = `${program[channel]} ${channel}`;
        const piece = keys.get(key) ?? { chunk, channel, notes: false };
        keys.set(key, piece);
        if (kind === 0x90 && b > 0) piece.notes = true;
        if (kind === 0xe0) {
          const list = channelBends.get(channel) ?? [];
          list.push({ tick, value: ((b << 7) | a) - 8192 });
          channelBends.set(channel, list);
        }
      } else {
        break; // data with no status: not a file we can follow (parseMidi notices)
      }
    }
    if (events === 0) continue;
    pieces.push(...(keys.size ? keys.values() : [{ chunk, channel: -1, notes: false }]));
  }
  const format = (bytes[8]! << 8) | bytes[9]!;
  if (format === 1 && pieces.length > 0 && !pieces[0]!.notes) pieces.shift();
  return { format, pieces, bends };
}

/** The General MIDI pitch-bend range, when a file doesn't set its own. */
const DEFAULT_BEND_RANGE = 2;
/**
 * Points kept a note (alphaTab writes a vibrato as a point every few milliseconds): this
 * many, or BEND_POINTS_PER_SECOND of its length, whichever is more (16 a second keeps every
 * peak and trough of an 8 Hz vibrato).
 */
const MAX_BEND_POINTS = 64;
const BEND_POINTS_PER_SECOND = 16;
/** Bends smaller than this (semitones) are no bend. */
const BEND_EPSILON = 0.02;

/**
 * The pitch-bend range, in semitones: set with RPN 0 (controllers 101 and 100 select it, then
 * data entry, controller 6, gives it), on the piece's own channel first, then the part's
 * other pieces. alphaTab sets 16; a file that sets nothing has the General MIDI default of 2.
 */
function bendRange(pieces: readonly ReaderTrack[]): number {
  for (const piece of pieces) {
    const cc = piece.controlChanges;
    const events = [101, 100, 6]
      .flatMap((number) => (cc[number] ?? []).map((c) => ({ number, ticks: c.ticks, value: Math.round(c.value * 127) })))
      .sort((a, b) => a.ticks - b.ticks);
    let msb = 127;
    let lsb = 127;
    for (const e of events) {
      if (e.number === 101) msb = e.value;
      else if (e.number === 100) lsb = e.value;
      else if (msb === 0 && lsb === 0 && e.value > 0) return e.value;
    }
  }
  return DEFAULT_BEND_RANGE;
}

/**
 * At most `max` points of a bend: its ends and its turning points (the peaks and troughs of
 * a vibrato, the top of a bend), so thinning never flattens a wobble (taking every n-th point
 * could land on the same part of each wave); while still too many (a very fast vibrato),
 * every other peak-and-trough pair goes, so the wobble keeps its depth and slows down.
 */
function thinBend(points: readonly BendPoint[], max: number): BendPoint[] {
  if (points.length <= max) return [...points];
  let kept = points.filter((p, i) => {
    if (i === 0 || i === points.length - 1) return true;
    const before = points[i - 1]!.semitones;
    const after = points[i + 1]!.semitones;
    return (p.semitones - before) * (after - p.semitones) <= 0; // the slope turns (or stops)
  });
  while (kept.length > max) {
    const inner = kept.slice(1, -1).filter((_, i) => Math.floor(i / 2) % 2 === 0);
    kept = [kept[0]!, ...inner, kept[kept.length - 1]!];
  }
  return kept;
}

/**
 * Each note's pitch bend from the track's pitch-bend events (-1..1 of `range` semitones): the
 * bend in force when it starts (alphaTab writes one at every note start, 0 for a plain note)
 * and every change while it sounds. Pitch bend is per channel, so a chord's notes bend
 * together, as a MIDI player would play them. Notes that don't move get none.
 */
export function attachBends(
  notes: readonly NoteEvent[],
  bends: readonly { time: number; value: number }[],
  range: number,
): NoteEvent[] {
  if (bends.length === 0) return [...notes];
  let k = 0;
  return notes.map((n) => {
    // the last bend at or before the start (notes are sorted, so k only moves on)
    while (k + 1 < bends.length && bends[k + 1]!.time <= n.start + 1e-6) k++;
    // (before any bend at all, the pitch is unbent: the first one may come mid-note)
    const before = bends[k]!.time <= n.start + 1e-6;
    const points: BendPoint[] = [{ at: 0, semitones: before ? bends[k]!.value * range : 0 }];
    for (let j = before ? k + 1 : k; j < bends.length && bends[j]!.time < n.start + n.duration - 1e-6; j++) {
      points.push({ at: bends[j]!.time - n.start, semitones: bends[j]!.value * range });
    }
    if (points.every((p) => Math.abs(p.semitones) < BEND_EPSILON)) return n;
    const kept = thinBend(points, Math.max(MAX_BEND_POINTS, Math.ceil(n.duration * BEND_POINTS_PER_SECOND)));
    return { ...n, bend: kept.map((p) => ({ at: +p.at.toFixed(4), semitones: +p.semitones.toFixed(3) })) };
  });
}

/** Parse a Standard MIDI File into note events in song seconds, keeping timing metadata. */
export function parseMidi(data: ArrayBuffer | Uint8Array, fileName: string): ParsedMidi {
  let midi: Midi;
  try {
    midi = new Midi(data);
  } catch {
    throw new MidiParseError(
      "unreadable",
      fileName,
      `${fileName} isn't a readable MIDI file. Export it again as a Standard MIDI File (.mid) and try once more.`,
    );
  }

  // where each of the reader's tracks came from; if the scan doesn't line up with the reader
  // (a file it can't follow), nothing is bent and nothing is joined by it
  const raw = channelEvents(data);
  // lined up when every piece is there, with the same notes-or-not as the reader's
  const aligned =
    raw.pieces.length === midi.tracks.length && raw.pieces.every((p, i) => p.notes === midi.tracks[i]!.notes.length > 0);
  const origins = new Map(aligned ? midi.tracks.map((t, i) => [t, raw.pieces[i]!] as const) : []);
  const origin = (t: ReaderTrack) => origins.get(t);
  const chunkOf = (t: ReaderTrack) => (raw.format === 1 ? (origin(t)?.chunk ?? -1) : -1);
  const converted = new Map<string, { time: number; value: number }[]>();
  const bendsOf = (chunk: number, channel: number) => {
    const key = `${chunk} ${channel}`;
    let list = converted.get(key);
    if (!list) {
      list = (raw.bends[chunk]?.get(channel) ?? []).map((b) => ({ time: midi.header.ticksToSeconds(b.tick), value: b.value / 8192 }));
      converted.set(key, list);
    }
    return list;
  };
  const tracks: ParsedMidiTrack[] = partsOf(midi.tracks, chunkOf)
    .map(({ index, name, first, pieces }): ParsedMidiTrack => {
      const notes: NoteEvent[] = pieces
        .flatMap((piece) => {
          const notes = piece.notes
            .filter((n) => n.duration > 0 || piece.instrument.percussion)
            .map((n) => ({ pitch: n.midi, start: n.time, duration: Math.max(n.duration, 0.05), velocity: n.velocity }))
            .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
          // drums don't bend; a piece's notes all share one channel, and take its bends
          const from = origin(piece);
          if (!from || piece.instrument.percussion || from.channel === 9) return notes;
          return attachBends(notes, bendsOf(from.chunk, from.channel), bendRange([piece, ...pieces]));
        })
        .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
      // channel and instrument from the first piece that plays: a piece with no notes (a
      // part's name and settings) reads as channel 0, a piano (a drum part came out as keys)
      const lead = pieces.find((p) => p.notes.length > 0) ?? first;
      const percussion = lead.instrument.percussion || lead.channel === 9;
      return {
        index,
        name: name || `Track ${index + 1}`,
        channel: lead.channel,
        program: lead.instrument.number,
        instrumentName: percussion ? "drum kit" : lead.instrument.name,
        isPercussion: percussion,
        notes,
      };
    })
    .filter((t) => t.notes.length > 0);

  if (tracks.length === 0) {
    throw new MidiParseError("no-notes", fileName, `${fileName} has no notes to play. Pick a MIDI file that contains note data.`);
  }

  const tempos = midi.header.tempos.map((t) => ({
    ticks: t.ticks,
    bpm: t.bpm,
    time: t.time ?? midi.header.ticksToSeconds(t.ticks),
  }));
  const timeSignatures = midi.header.timeSignatures.map((ts) => ({
    ticks: ts.ticks,
    numerator: ts.timeSignature[0] ?? 4,
    denominator: ts.timeSignature[1] ?? 4,
  }));

  // a loop, not Math.max(...notes): spreading 100k+ notes overflows the call stack
  let lastNoteEnd = 0;
  for (const t of tracks) for (const n of t.notes) lastNoteEnd = Math.max(lastNoteEnd, n.start + n.duration);

  return {
    meta: {
      fileName,
      ppq: midi.header.ppq,
      tempos,
      timeSignatures,
      durationSeconds: Math.max(lastNoteEnd, 0.1),
    },
    tracks,
  };
}
