import { Midi } from "@tonejs/midi";
import type { NoteEvent, ParsedMidi, ParsedMidiTrack } from "@/types/midi";

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
 * Names are decoded before they are trimmed: trim() would cut a UTF-8 byte 0xA0 (the end
 * of "ム" in ドラム) off the raw text.
 */
function partsOf(tracks: readonly ReaderTrack[]): Part[] {
  const parts: Part[] = [];
  tracks.forEach((track, index) => {
    const name = decodeMidiText(track.name).trim();
    const before = tracks[index - 1];
    const last = parts[parts.length - 1];
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

  const tracks: ParsedMidiTrack[] = partsOf(midi.tracks)
    .map(({ index, name, first, pieces }): ParsedMidiTrack => {
      const notes: NoteEvent[] = pieces
        .flatMap((piece) => piece.notes.filter((n) => n.duration > 0 || piece.instrument.percussion))
        .map((n) => ({
          pitch: n.midi,
          start: n.time,
          duration: Math.max(n.duration, 0.05),
          velocity: n.velocity,
        }))
        .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
      const percussion = first.instrument.percussion || first.channel === 9;
      return {
        index,
        name: name || `Track ${index + 1}`,
        channel: first.channel,
        program: first.instrument.number,
        instrumentName: percussion ? "drum kit" : first.instrument.name,
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
